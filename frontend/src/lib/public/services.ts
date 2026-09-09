export type Service = {
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string;
  readonly description: string;
  readonly fromPrice: string;
  readonly duration: string;
  readonly includes: readonly string[];
  readonly image: {
    readonly src: string;
    readonly alt: string;
  };
  readonly accent: 'blue' | 'yellow' | 'green' | 'rust' | 'ice' | 'lilac';
};

export const services = [
  {
    slug: 'bilservice',
    name: 'Bilservice',
    shortDescription:
      'Service efter tillverkarens intervall, med tydligt protokoll och rätt olja.',
    description:
      'Vi servar bilen efter tillverkarens intervall och går samtidigt igenom de delar som påverkar säkerhet, driftsäkerhet och bilens värde. Du får veta vad som är gjort, vad som kan vänta och vad vi rekommenderar att åtgärda.',
    fromPrice: 'från 2 495 kr',
    duration: '2–4 timmar',
    includes: [
      'Motorolja och oljefilter enligt specifikation',
      'Kontroll av bromsar, däck, vätskor och belysning',
      'Diagnos och återställning av serviceindikator',
      'Digitalt serviceprotokoll med tydliga rekommendationer',
    ],
    image: {
      src: '/images/services/bilservice.jpg',
      alt: 'Mekaniker som utför oljeservice på en billyft',
    },
    accent: 'blue',
  },
  {
    slug: 'felsokning',
    name: 'Felsökning',
    shortDescription:
      'Systematisk diagnos av varningslampor, missljud och elektriska fel.',
    description:
      'Bra felsökning handlar om att mäta innan man byter delar. Vi kombinerar erfarenhet med modern diagnosutrustning och dokumenterar vad vi hittar innan du tar beslut om en reparation.',
    fromPrice: 'från 1 295 kr',
    duration: '1–3 timmar',
    includes: [
      'Intervju och provkörning när det behövs',
      'Felkodsavläsning och mätning av berörda system',
      'Orsaksanalys – inte bara radering av felkoder',
      'Kostnadsförslag före fortsatt reparation',
    ],
    image: {
      src: '/images/services/felsokning.jpg',
      alt: 'Mekaniker som diagnostiserar en bil med en digital surfplatta',
    },
    accent: 'yellow',
  },
  {
    slug: 'bromsar',
    name: 'Bromsar',
    shortDescription:
      'Kontroll och byte av belägg, skivor, vätska och mekaniska delar.',
    description:
      'Bromsar ska kännas konsekventa varje gång. Vi mäter slitaget, kontrollerar hela systemet och använder komponenter som passar bilens vikt, effekt och körprofil.',
    fromPrice: 'från 1 995 kr',
    duration: '2–5 timmar',
    includes: [
      'Mätning av skivor och belägg',
      'Kontroll av ok, slangar och bromsvätska',
      'Rengöring och smörjning av anliggningsytor',
      'Provkörning och dokumenterad slutkontroll',
    ],
    image: {
      src: '/images/services/bromsar.jpg',
      alt: 'Noggrann kontroll av bromsskiva och bromsok',
    },
    accent: 'rust',
  },
  {
    slug: 'dack-hjulinstallning',
    name: 'Däck & hjulinställning',
    shortDescription:
      'Skifte, balansering och fyrhjulsmätning för lugnare och säkrare körning.',
    description:
      'Rätt hjulvinklar ger bättre väghållning, jämnare däckslitage och lägre förbrukning. Vi mäter bilen noggrant och justerar efter tillverkarens värden.',
    fromPrice: 'från 595 kr',
    duration: '45–120 minuter',
    includes: [
      'Kontroll av mönsterdjup och lufttryck',
      'Momentdragning enligt bilens specifikation',
      'Balansering eller fyrhjulsmätning enligt beställning',
      'Protokoll med mätvärden före och efter justering',
    ],
    image: {
      src: '/images/services/dack-hjulinstallning.jpg',
      alt: 'Hjulinställning med modern mätutrustning',
    },
    accent: 'green',
  },
  {
    slug: 'ac-klimat',
    name: 'AC & klimat',
    shortDescription:
      'Felsökning, täthetskontroll och service av bilens klimatsystem.',
    description:
      'Ett friskt klimatsystem ger både komfort och bättre sikt. Vi kontrollerar temperatur, tryck och täthet innan systemet fylls eller repareras.',
    fromPrice: 'från 1 495 kr',
    duration: '1–2 timmar',
    includes: [
      'Funktions- och temperaturkontroll',
      'Täthetsprov och tryckmätning',
      'Tömning och fyllning enligt fordonets specifikation',
      'Kontroll av kupéfilter och kondensavrinning',
    ],
    image: {
      src: '/images/services/ac-klimat.jpg',
      alt: 'Service av bilens klimatsystem med AC-mätare',
    },
    accent: 'ice',
  },
  {
    slug: 'motor-vaxellada',
    name: 'Motor & växellåda',
    shortDescription:
      'Kvalificerade mekaniska reparationer, från kamrem till drivlina.',
    description:
      'När arbetet blir större behöver du en verkstad som kan förklara alternativen. Vi felsöker, planerar och genomför avancerade mekaniska jobb med spårbara delar och tydliga kontrollpunkter.',
    fromPrice: 'pris efter diagnos',
    duration: 'Enligt arbetsplan',
    includes: [
      'Mekanisk diagnos och kompressionskontroll vid behov',
      'Kamrem, koppling, kylsystem och drivlina',
      'Skriftlig arbetsplan och kostnadsförslag',
      'Dokumenterad provkörning och kvalitetskontroll',
    ],
    image: {
      src: '/images/services/motor-vaxellada.jpg',
      alt: 'Mekaniker som arbetar med motor och växellåda',
    },
    accent: 'lilac',
  },
] as const satisfies readonly Service[];

export function getService(slug: string): Service | undefined {
  return services.find((service) => service.slug === slug);
}
