import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: `Cookie policy | ${SITE_NAME}`,
  description:
    "Informativa sui cookie e sulle tecnologie di consenso usate da Ice Cream Empire.",
  alternates: { canonical: "/cookie-policy" },
  robots: { index: true, follow: true },
};

const lastUpdated = "14 giugno 2026";

export default function CookiePolicyPage() {
  return (
    <main className="policy-shell">
      <article className="policy-document">
        <Link className="policy-back" href="/">
          Torna al gioco
        </Link>

        <header>
          <p className="eyebrow">Ice Cream Empire</p>
          <h1>Cookie policy</h1>
          <p>
            Questa pagina descrive come {SITE_NAME} usa cookie, tecnologie
            analoghe e segnali di consenso sul dominio{" "}
            <a href={SITE_URL}>{SITE_URL}</a>.
          </p>
          <small>Ultimo aggiornamento: {lastUpdated}</small>
        </header>

        <section>
          <h2>Titolare</h2>
          <p>
            Il sito è gestito da VEDA Srl. In questa informativa non sono
            riportati dati societari ulteriori non presenti nel progetto: per
            richieste formali o informazioni aggiuntive si rimanda ai canali
            ufficiali di VEDA Srl.
          </p>
        </section>

        <section>
          <h2>Cosa sono cookie e tecnologie simili</h2>
          <p>
            I cookie sono piccoli file o identificatori salvati dal browser. Il
            sito può usare anche tecnologie equivalenti, come localStorage, per
            ricordare preferenze tecniche sul dispositivo dell&apos;utente.
          </p>
        </section>

        <section>
          <h2>Categorie usate dal sito</h2>
          <div className="policy-table-wrap">
            <table className="policy-table">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Finalità</th>
                  <th>Base di attivazione</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Necessari</td>
                  <td>
                    Consentono il funzionamento del sito, della stanza di gioco
                    e delle preferenze tecniche essenziali.
                  </td>
                  <td>Sempre attivi</td>
                </tr>
                <tr>
                  <td>Preferenze</td>
                  <td>
                    Memorizzano scelte locali utili a rendere più comoda
                    l&apos;esperienza sullo stesso dispositivo.
                  </td>
                  <td>Solo previo consenso</td>
                </tr>
                <tr>
                  <td>Statistiche</td>
                  <td>
                    Aiutano a misurare l&apos;uso del sito tramite tag
                    configurati in Google Tag Manager.
                  </td>
                  <td>Solo previo consenso</td>
                </tr>
                <tr>
                  <td>Marketing</td>
                  <td>
                    Consentono eventuali tag pubblicitari o misurazioni
                    marketing, inclusi segnali Google Ads se configurati nel
                    container GTM.
                  </td>
                  <td>Solo previo consenso</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Google Tag Manager e Consent Mode V2</h2>
          <p>
            Il sito integra Google Tag Manager con container{" "}
            <code>GTM-MWCCJP8Z</code>. Prima del caricamento del container, i
            consensi Google non necessari sono impostati su <code>denied</code>{" "}
            per <code>ad_storage</code>, <code>analytics_storage</code>,{" "}
            <code>ad_user_data</code> e <code>ad_personalization</code>. Quando
            l&apos;utente salva una scelta, il sito invia l&apos;aggiornamento
            corrispondente tramite Google Consent Mode V2.
          </p>
          <p>
            Eventuali tag configurati dentro Google Tag Manager devono rispettare
            questi segnali di consenso e attivarsi solo in modo coerente con la
            categoria accettata dall&apos;utente.
          </p>
        </section>

        <section>
          <h2>Come modificare o revocare il consenso</h2>
          <p>
            Puoi cambiare preferenze in qualsiasi momento dal link “Preferenze
            cookie” presente nel footer della home page. In alternativa puoi
            cancellare dati, cookie e archiviazione locale dalle impostazioni del
            browser.
          </p>
        </section>

        <section>
          <h2>Conservazione della scelta</h2>
          <p>
            La preferenza di consenso viene salvata nel browser in localStorage
            con chiave versionata. La scelta resta sul dispositivo finché non
            viene modificata dall&apos;utente, cancellata dal browser o resa
            obsoleta da una nuova versione del banner.
          </p>
        </section>
      </article>
    </main>
  );
}
