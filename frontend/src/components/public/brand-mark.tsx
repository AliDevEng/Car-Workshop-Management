import { cn } from '@/lib/utils';

export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-grid size-9 shrink-0 place-items-center rounded-full border-[3px] border-current',
        className,
      )}
    >
      <span className="size-2 rounded-full bg-current" />
      <span className="absolute inset-[5px] rounded-full border border-current opacity-50" />
      <span className="absolute h-[2px] w-full rotate-45 bg-current" />
      <span className="absolute h-[2px] w-full -rotate-45 bg-current" />
    </span>
  );
}
