import Image from 'next/image';
import logo from '../../../public/images/Mome-bilservice-Logo1.png';
import { cn } from '@/lib/utils';

const markSizes = {
  compact: { className: 'size-14', sizes: '48px' },
  navigation: {
    className: 'size-16 sm:size-18',
    sizes: '(min-width: 640px) 64px, 56px',
  },
  feature: {
    className: 'size-24 sm:size-28',
    sizes: '(min-width: 640px) 104px, 88px',
  },
} as const;

export function BrandMark({
  size = 'navigation',
  surface = 'light',
}: {
  readonly size?: keyof typeof markSizes;
  readonly surface?: 'light' | 'dark';
}) {
  const dimensions = markSizes[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full p-1 ring-1',
        dimensions.className,
        surface === 'light'
          ? 'bg-white shadow-sm ring-steel/15'
          : 'bg-transparent ring-white/30',
      )}
    >
      <Image
        src={logo}
        alt=""
        loading="eager"
        quality={75}
        sizes={dimensions.sizes}
        className="size-full rounded-full object-contain"
      />
    </span>
  );
}
