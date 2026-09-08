import type { Metadata } from 'next';
import Link from 'next/link';
import { getWorkshopInfo } from '@/lib/public/workshop';

export const metadata: Metadata = {
  title: 'Integritetspolicy',
  description: 'Så behandlar Verkstaden personuppgifter vid kontakt och bokning.',
  alternates: { canonical: '/integritetspolicy' },
};

export default async function PrivacyPage() {
  const info = await getWorkshopInfo();

  return (
    <main id="main-content">
      <header className="page-hero pb-12 sm:pb-16">
        <div className="site-container">
          <p className="section-kicker">Din integritet</p>
          <h1 className="page-title max-w-5xl">Tydligt om dina uppgifter.</h1>
          <p className="page-lead">
            Vi samlar bara in det vi behöver för att kunna hjälpa dig och din bil.
          </p>
        </div>
      </header>
      <article className="site-container grid gap-12 pb-24 sm:pb-32 lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="h-fit rounded-soft bg-[#d8e8f5] p-7 text-sm leading-relaxed lg:sticky lg:top-28">
          <p className="font-sans font-bold">Personuppgiftsansvarig</p>
          <p className="mt-3">{info.workshop.name}</p>
          <p>Org.nr {info.workshop.orgNumber}</p>
          <a className="mt-3 block break-all font-semibold text-link underline underline-offset-4" href={`mailto:${info.workshop.email}`}>
            {info.workshop.email}
          </a>
        </aside>
        <div className="prose-public">
          <section>
            <h2>Vad vi samlar in</h2>
            <p>
              När du bokar eller kontaktar oss behandlar vi de uppgifter du lämnar,
              till exempel namn, telefonnummer, e-postadress, registreringsnummer,
              önskad tid och ditt meddelande. När vi arbetar med bilen sparar vi den
              information som behövs för arbetsorder, historik, offert och fakturaunderlag.
            </p>
          </section>
          <section>
            <h2>Varför vi använder uppgifterna</h2>
            <p>
              Uppgifterna används för att svara på din förfrågan, planera och utföra
              arbetet, kontakta dig om bilen samt uppfylla rättsliga krav. Vi säljer
              aldrig personuppgifter och använder dem inte för automatiserade beslut.
            </p>
          </section>
          <section>
            <h2>Hur länge de sparas</h2>
            <p>
              En bokningsförfrågan som inte leder till ett uppdrag rensas när den inte
              längre behövs. Uppgifter som hör till bokföring och dokumenterat arbete
              kan behöva sparas i sju år. Därefter raderas eller anonymiseras uppgifterna
              enligt vår gallringsrutin.
            </p>
          </section>
          <section>
            <h2>Dina rättigheter</h2>
            <p>
              Du kan begära ett registerutdrag, rättelse eller radering och invända mot
              viss behandling. Vissa uppgifter måste finnas kvar när lag kräver det, men
              då begränsar vi användningen till det ändamålet.
            </p>
          </section>
          <section>
            <h2>Kontakta oss om dina uppgifter</h2>
            <p>
              Mejla{' '}
              <a href={`mailto:${info.workshop.email}`}>{info.workshop.email}</a> eller
              använd kontaktuppgifterna på vår <Link href="/kontakt">kontaktsida</Link>.
              Beskriv vad du vill ha hjälp med så återkommer vi och verifierar din identitet.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
