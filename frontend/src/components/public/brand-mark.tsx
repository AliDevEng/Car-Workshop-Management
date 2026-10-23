import Image from 'next/image';
import logoBlack from '../../../public/images/MR Verkstad_Logo_Svart.png';
import logoTransparent from '../../../public/images/MR Verkstad_Logo_Transparent.png';
import logoWhite from '../../../public/images/MR Verkstad_Logo_Vit.png';
import { cn } from '@/lib/utils';

const markSizes = {
  compact: { className: 'h-12 w-16', sizes: '64px' },
  navigation: {
    className: 'h-16 w-36 sm:h-[4.5rem] sm:w-40',
    sizes: '(min-width: 640px) 160px, 144px',
  },
  feature: {
    className: 'h-32 w-64 sm:h-36 sm:w-72',
    sizes: '(min-width: 640px) 288px, 256px',
  },
} as const;

const logos = {
  dark: logoBlack,
  light: logoWhite,
  transparent: logoTransparent,
} as const;

export function BrandMark({
  size = 'navigation',
  surface = 'transparent',
}: {
  readonly size?: keyof typeof markSizes;
  readonly surface?: keyof typeof logos;
}) {
  const dimensions = markSizes[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        dimensions.className,
      )}
    >
      <Image
        src={logos[surface]}
        alt=""
        loading="eager"
        quality={75}
        sizes={dimensions.sizes}
        className={cn(
          'size-full',
          size === 'compact' ? 'object-contain' : 'object-cover',
        )}
      />
    </span>
  );
}
