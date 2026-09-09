import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Service } from '@/lib/public/services';
import { cn } from '@/lib/utils';

const accentClasses: Readonly<Record<Service['accent'], string>> = {
  blue: 'service-card-blue',
  yellow: 'service-card-yellow',
  green: 'service-card-green',
  rust: 'service-card-rust',
  ice: 'service-card-ice',
  lilac: 'service-card-lilac',
};

export function ServiceCard({
  service,
  index,
}: {
  readonly service: Service;
  readonly index: number;
}) {
  return (
    <article
      className={cn('service-card group', accentClasses[service.accent])}
    >
      <div className="service-card-media">
        <Image
          src={service.image.src}
          alt={service.image.alt}
          fill
          sizes="(max-width: 1023px) 100vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-[1.035]"
        />
        <div className="service-card-media-shade" />
        <span className="service-card-number">0{String(index + 1)}</span>
        <ArrowUpRight
          aria-hidden="true"
          className="service-card-arrow size-6"
        />
      </div>
      <div className="service-card-body">
        <h2 className="type-display text-3xl font-bold sm:text-4xl">
          {service.name}
        </h2>
        <p className="mt-4 max-w-md text-base leading-relaxed text-steel/75">
          {service.shortDescription}
        </p>
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-steel/20 pt-5 font-sans text-sm font-semibold">
          <span className="tabular-nums">{service.fromPrice}</span>
          <Link href={`/tjanster/${service.slug}`} className="stretched-link">
            Läs mer<span className="sr-only"> om {service.name}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
