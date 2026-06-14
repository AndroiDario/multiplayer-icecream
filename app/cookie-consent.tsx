"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "icecreamempire:cookie-consent:v1";
const CONSENT_VERSION = 1;
const OPEN_PREFERENCES_EVENT = "icecreamempire:open-cookie-preferences";

type ConsentStatus = "granted" | "denied";

type ConsentPreferences = {
  version: typeof CONSENT_VERSION;
  updatedAt: string;
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

type PreferenceToggle = "preferences" | "analytics" | "marketing";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const defaultPreferences: ConsentPreferences = {
  version: CONSENT_VERSION,
  updatedAt: "",
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

const categories: Array<{
  key: "necessary" | PreferenceToggle;
  title: string;
  description: string;
  locked?: boolean;
}> = [
  {
    key: "necessary",
    title: "Necessari",
    description:
      "Servono per far funzionare il sito, la stanza di gioco e le preferenze tecniche essenziali.",
    locked: true,
  },
  {
    key: "preferences",
    title: "Preferenze",
    description:
      "Memorizzano scelte locali utili a rendere più comoda l'esperienza sullo stesso dispositivo.",
  },
  {
    key: "analytics",
    title: "Statistiche",
    description:
      "Aiutano a capire come viene usato Ice Cream Empire tramite tag configurati in Google Tag Manager.",
  },
  {
    key: "marketing",
    title: "Marketing",
    description:
      "Consentono tag pubblicitari o di misurazione marketing, inclusi i segnali Google Ads se configurati in GTM.",
  },
];

function isConsentPreferences(value: unknown): value is ConsentPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === CONSENT_VERSION &&
    candidate.necessary === true &&
    typeof candidate.preferences === "boolean" &&
    typeof candidate.analytics === "boolean" &&
    typeof candidate.marketing === "boolean" &&
    typeof candidate.updatedAt === "string"
  );
}

function toConsentStatus(value: boolean): ConsentStatus {
  return value ? "granted" : "denied";
}

function applyGoogleConsent(preferences: ConsentPreferences) {
  if (typeof window === "undefined") return;

  window.dataLayer = window.dataLayer || [];
  const gtag =
    window.gtag ??
    ((...args: unknown[]) => {
      window.dataLayer?.push(args);
    });

  window.gtag = gtag;
  gtag("consent", "update", {
    ad_storage: toConsentStatus(preferences.marketing),
    analytics_storage: toConsentStatus(preferences.analytics),
    ad_user_data: toConsentStatus(preferences.marketing),
    ad_personalization: toConsentStatus(preferences.marketing),
  });
}

function saveConsent(preferences: ConsentPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  applyGoogleConsent(preferences);
}

export default function CookieConsent() {
  const [hydrated, setHydrated] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [draft, setDraft] = useState<ConsentPreferences>(defaultPreferences);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      setHydrated(true);

      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as unknown;
          if (isConsentPreferences(parsed)) {
            setDraft(parsed);
            applyGoogleConsent(parsed);
            return;
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      setBannerVisible(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    const openSettings = () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as unknown;
          if (isConsentPreferences(parsed)) {
            setDraft(parsed);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      setBannerVisible(false);
      setSettingsVisible(true);
    };

    window.addEventListener(OPEN_PREFERENCES_EVENT, openSettings);
    return () => {
      window.removeEventListener(OPEN_PREFERENCES_EVENT, openSettings);
    };
  }, []);

  const persist = (nextPreferences: ConsentPreferences) => {
    const stamped = {
      ...nextPreferences,
      necessary: true,
      updatedAt: new Date().toISOString(),
    };

    setDraft(stamped);
    saveConsent(stamped);
    setBannerVisible(false);
    setSettingsVisible(false);
  };

  const acceptAll = () => {
    persist({
      ...defaultPreferences,
      preferences: true,
      analytics: true,
      marketing: true,
    });
  };

  const rejectAll = () => {
    persist(defaultPreferences);
  };

  const saveDraft = () => {
    persist(draft);
  };

  const updateDraft = (key: PreferenceToggle) => {
    setDraft((current) => ({ ...current, [key]: !current[key] }));
  };

  if (!hydrated || (!bannerVisible && !settingsVisible)) {
    return null;
  }

  return (
    <div className="cookie-consent" aria-live="polite">
      {bannerVisible ? (
        <section className="cookie-banner" aria-label="Preferenze cookie">
          <div className="cookie-copy">
            <p className="eyebrow">Privacy e consenso</p>
            <h2>Gestisci i cookie di Ice Cream Empire</h2>
            <p>
              Usiamo cookie necessari per il funzionamento del gioco e, solo con
              il tuo consenso, categorie aggiuntive per preferenze, statistiche
              e marketing tramite Google Tag Manager.
            </p>
            <a href="/cookie-policy">Leggi la cookie policy</a>
          </div>

          <div className="cookie-actions">
            <button className="ghost-button" onClick={rejectAll} type="button">
              Rifiuta tutto
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                setBannerVisible(false);
                setSettingsVisible(true);
              }}
              type="button"
            >
              Personalizza
            </button>
            <button className="primary-button" onClick={acceptAll} type="button">
              Accetta tutto
            </button>
          </div>
        </section>
      ) : null}

      {settingsVisible ? (
        <section
          aria-labelledby="cookie-settings-title"
          aria-modal="true"
          className="cookie-modal"
          role="dialog"
        >
          <div className="cookie-modal-head">
            <div>
              <p className="eyebrow">Centro preferenze</p>
              <h2 id="cookie-settings-title">Preferenze cookie</h2>
            </div>
            <button
              aria-label="Chiudi preferenze cookie"
              className="cookie-icon-button"
              onClick={() => setSettingsVisible(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <div className="cookie-category-list">
            {categories.map((category) => {
              const enabled =
                category.key === "necessary" ? true : draft[category.key];

              return (
                <label className="cookie-category" key={category.key}>
                  <span>
                    <strong>{category.title}</strong>
                    <small>{category.description}</small>
                  </span>
                  <input
                    checked={enabled}
                    disabled={category.locked}
                    onChange={() => {
                      if (category.key !== "necessary") {
                        updateDraft(category.key);
                      }
                    }}
                    type="checkbox"
                  />
                </label>
              );
            })}
          </div>

          <div className="cookie-actions">
            <button className="ghost-button" onClick={rejectAll} type="button">
              Rifiuta tutto
            </button>
            <button className="ghost-button" onClick={acceptAll} type="button">
              Accetta tutto
            </button>
            <button className="primary-button" onClick={saveDraft} type="button">
              Salva preferenze
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
