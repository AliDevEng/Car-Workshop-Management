'use client';

import {
  CarFrontIcon,
  PackageIcon,
  SearchIcon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {
  SEARCH_RESULT_TYPE_LABELS,
  searchResponseSchema,
  searchResultSchema,
  type SearchResult,
} from 'shared';
import { z } from 'zod';
import { ErrorState } from '@/components/admin/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiFetch, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type SupportedSearchResult = Extract<
  SearchResult,
  { type: 'CUSTOMER' | 'VEHICLE' | 'ARTICLE' }
>;

const RECENT_SEARCHES_KEY = 'verkstad.recentSearches';
const recentSearchesSchema = z.array(searchResultSchema).max(8);

function isSupportedResult(
  result: SearchResult,
): result is SupportedSearchResult {
  return (
    result.type === 'CUSTOMER' ||
    result.type === 'VEHICLE' ||
    result.type === 'ARTICLE'
  );
}

function resultHref(result: SupportedSearchResult): string {
  switch (result.type) {
    case 'CUSTOMER':
      return `/admin/kunder/${result.id}`;
    case 'VEHICLE':
      return `/admin/fordon/${result.id}`;
    case 'ARTICLE':
      return `/admin/lager/${result.id}`;
  }
}

function resultTitle(result: SupportedSearchResult): string {
  switch (result.type) {
    case 'CUSTOMER':
      return result.name;
    case 'VEHICLE':
      return result.registrationNumberDisplay;
    case 'ARTICLE':
      return result.name;
  }
}

function resultDescription(result: SupportedSearchResult): string {
  switch (result.type) {
    case 'CUSTOMER':
      return result.phone;
    case 'VEHICLE':
      return `${result.make} ${result.model}${
        result.customerName === null ? '' : ` · ${result.customerName}`
      }`;
    case 'ARTICLE':
      return result.sku;
  }
}

const RESULT_ICONS: Readonly<
  Record<SupportedSearchResult['type'], typeof UserRoundIcon>
> = {
  CUSTOMER: UserRoundIcon,
  VEHICLE: CarFrontIcon,
  ARTICLE: PackageIcon,
};

function ResultIcon({
  type,
}: {
  readonly type: SupportedSearchResult['type'];
}) {
  const Icon = RESULT_ICONS[type];
  return <Icon aria-hidden="true" className="size-4 text-muted-foreground" />;
}

function readRecentSearches(): readonly SupportedSearchResult[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
  if (raw === null) {
    return [];
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = recentSearchesSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.filter(isSupportedResult);
}

function writeRecentSearches(results: readonly SupportedSearchResult[]): void {
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(results));
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly SupportedSearchResult[]>([]);
  const [recent, setRecent] = useState<readonly SupportedSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const resultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const router = useRouter();

  useEffect(() => {
    function openFromShortcut(event: KeyboardEvent): void {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isTyping) {
        return;
      }

      if (
        event.key === '/' ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        openSearch();
      }
    }

    document.addEventListener('keydown', openFromShortcut);
    return () => {
      document.removeEventListener('keydown', openFromShortcut);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({ q: trimmed });
      void apiFetch(`/search?${params.toString()}`, searchResponseSchema)
        .then((response) => {
          if (!cancelled) {
            setResults(response.results.filter(isSupportedResult));
          }
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            setResults([]);
            setError(
              caught instanceof ApiError
                ? caught
                : ApiError.invalidResponse('Sökningen kunde inte visas.'),
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const grouped = useMemo(() => {
    const next: Record<SupportedSearchResult['type'], SupportedSearchResult[]> =
      {
        CUSTOMER: [],
        VEHICLE: [],
        ARTICLE: [],
      };
    for (const result of results) {
      next[result.type].push(result);
    }
    return next;
  }, [results]);

  function openResult(result: SupportedSearchResult): void {
    const nextRecent = [
      result,
      ...recent.filter(
        (item) => item.type !== result.type || item.id !== result.id,
      ),
    ].slice(0, 6);
    setRecent(nextRecent);
    writeRecentSearches(nextRecent);
    setOpen(false);
    setQuery('');
    router.push(resultHref(result));
  }

  const shownRecent = query.trim().length === 0;
  const hasResults = results.length > 0;
  const rows = shownRecent ? recent : results;

  function openSearch(): void {
    setRecent(readRecentSearches());
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        /*
         * Icon-only below `sm`: the full placeholder plus the logout label
         * made the admin header wider than a 390 px viewport, and the header
         * is the one thing on every page (UI_UX_AUDIT G1). 44 px rather than
         * the 36 px that compromise settled on — F13 moved the account block
         * out of the header, so the room is there and the search control can
         * meet the admin touch-target floor like everything else.
         */
        className="min-w-0 shrink justify-start text-muted-foreground max-sm:size-11 max-sm:shrink-0 max-sm:justify-center max-sm:p-0 md:w-[340px]"
        onClick={() => {
          openSearch();
        }}
      >
        <SearchIcon aria-hidden="true" />
        <span className="truncate max-sm:sr-only">
          Sök kund, fordon eller artikel
        </span>
        <kbd className="ml-auto hidden rounded-sharp border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground md:inline">
          /
        </kbd>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            openSearch();
            return;
          }
          setOpen(false);
        }}
      >
        <DialogContent
          className="top-20 max-h-[min(680px,calc(100dvh-4rem))] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border p-3">
            <SearchIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <DialogTitle className="sr-only">Sök</DialogTitle>
            <DialogDescription className="sr-only">
              Sök efter kunder, fordon och artiklar i registret.
            </DialogDescription>
            <Input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && rows[0] !== undefined) {
                  event.preventDefault();
                  openResult(rows[0]);
                  return;
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  if (rows.length > 0) {
                    resultButtonRefs.current[0]?.focus();
                  }
                }
              }}
              placeholder="Sök på namn, telefon, regnr eller artikelnummer"
              className="border-0 px-0 focus-visible:border-transparent"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setOpen(false);
              }}
            >
              <XIcon aria-hidden="true" />
              <span className="sr-only">Stäng sök</span>
            </Button>
          </div>

          <div className="max-h-[540px] overflow-y-auto p-2">
            {error === null || shownRecent ? null : (
              <ErrorState
                message={error.message}
                className="py-8"
                {...(error.requestId === undefined
                  ? {}
                  : { requestId: error.requestId })}
              />
            )}

            {error === null && !shownRecent && isLoading ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Söker...
              </p>
            ) : null}

            {error === null &&
            !isLoading &&
            shownRecent &&
            recent.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Senaste träffar visas här när du har öppnat något.
              </p>
            ) : null}

            {error === null && !isLoading && !shownRecent && !hasResults ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Ingen kund, fordon eller artikel matchar sökningen.
              </p>
            ) : null}

            {shownRecent && recent.length > 0 ? (
              <ResultGroup
                title="Senast öppnade"
                results={recent}
                onOpen={openResult}
                buttonRefs={resultButtonRefs}
              />
            ) : null}

            {!shownRecent && hasResults ? (
              <>
                <ResultGroup
                  title={SEARCH_RESULT_TYPE_LABELS.CUSTOMER}
                  results={grouped.CUSTOMER}
                  onOpen={openResult}
                  buttonRefs={resultButtonRefs}
                />
                <ResultGroup
                  title={SEARCH_RESULT_TYPE_LABELS.VEHICLE}
                  results={grouped.VEHICLE}
                  onOpen={openResult}
                  buttonRefs={resultButtonRefs}
                  offset={grouped.CUSTOMER.length}
                />
                <ResultGroup
                  title={SEARCH_RESULT_TYPE_LABELS.ARTICLE}
                  results={grouped.ARTICLE}
                  onOpen={openResult}
                  buttonRefs={resultButtonRefs}
                  offset={grouped.CUSTOMER.length + grouped.VEHICLE.length}
                />
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultGroup({
  title,
  results,
  onOpen,
  buttonRefs,
  offset = 0,
}: {
  readonly title: string;
  readonly results: readonly SupportedSearchResult[];
  readonly onOpen: (result: SupportedSearchResult) => void;
  readonly buttonRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  readonly offset?: number;
}) {
  if (results.length === 0) {
    return null;
  }

  return (
    <section className="py-2">
      <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-col gap-1">
        {results.map((result, index) => (
          <button
            key={`${result.type}:${result.id}`}
            ref={(node) => {
              buttonRefs.current[offset + index] = node;
            }}
            type="button"
            className={cn(
              'grid min-h-11 grid-cols-[20px_minmax(0,1fr)] items-center gap-3 rounded-sharp px-2 py-2 text-left',
              'hover:bg-accent focus-visible:bg-accent',
            )}
            onClick={() => {
              onOpen(result);
            }}
          >
            <ResultIcon type={result.type} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {resultTitle(result)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {resultDescription(result)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
