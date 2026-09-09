import type { MetadataRoute } from 'next';
import { services } from '@/lib/public/services';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://verkstaden.se';
  const routes = ['', '/tjanster', '/om-oss', '/kontakt', '/integritetspolicy'];

  return [
    ...routes.map((route) => ({
      url: `${baseUrl}${route}`,
      changeFrequency:
        route === '' ? ('weekly' as const) : ('monthly' as const),
      priority: route === '' ? 1 : 0.8,
    })),
    ...services.map((service) => ({
      url: `${baseUrl}/tjanster/${service.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    })),
  ];
}
