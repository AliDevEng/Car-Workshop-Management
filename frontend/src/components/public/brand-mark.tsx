import Image from 'next/image';

export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <Image
      src="/images/Mome-bilservice-Logo1.png"
      alt=""
      aria-hidden="true"
      width={96}
      height={96}
      loading="eager"
      sizes="64px"
      className={`shrink-0 rounded-full object-cover ${className ?? 'size-12'}`}
    />
  );
}
