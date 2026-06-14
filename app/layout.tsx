/* eslint-disable @next/next/next-script-for-ga */
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import CookieConsent from "./cookie-consent";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Ice Cream Empire — Business game di marketing per la classe",
  description:
    "Business game gratuito per docenti di economia e marketing: le squadre della classe gestiscono gelaterie rivali e imparano le 4P del marketing mix, trimestre dopo trimestre.",
  keywords: [
    "business game",
    "gioco didattico marketing",
    "marketing mix",
    "4P",
    "simulazione d'impresa",
    "didattica economia",
    "strumento per docenti",
    "Ice Cream Empire",
  ],
  applicationName: SITE_NAME,
  creator: "VEDA Srl",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    locale: "it_IT",
    title: "Ice Cream Empire — Business game di marketing per la classe",
    description:
      "Simulazione multiplayer gratuita del marketing mix: gelaterie rivali, 12 trimestri, decisioni sulle 4P. Per professori di economia e marketing.",
    images: [
      {
        url: "/screenshot.jpeg",
        width: 1200,
        height: 750,
        alt: "La plancia di gioco di Ice Cream Empire",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ice Cream Empire — Business game di marketing per la classe",
    description:
      "Simulazione multiplayer gratuita del marketing mix per la classe. 12 trimestri, 4P, squadre rivali.",
    images: ["/screenshot.jpeg"],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf4",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": ["WebApplication", "VideoGame"],
  name: SITE_NAME,
  url: SITE_URL,
  image: `${SITE_URL}/screenshot.jpeg`,
  description:
    "Business game multiplayer gratuito per la didattica del marketing: le squadre gestiscono gelaterie rivali e imparano le 4P del marketing mix.",
  inLanguage: "it",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  gamePlatform: "Browser",
  genre: "Simulazione d'impresa",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  educationalUse: "instruction",
  audience: { "@type": "EducationalAudience", educationalRole: "teacher" },
  creator: {
    "@type": "Organization",
    name: "VEDA Srl",
    url: "https://veda.consulting",
  },
  isBasedOn:
    "https://www.unibocconi.it/it/news/ice-cream-empire-il-gioco-bocconi-aspiranti-imprenditori",
};

const gtmId = "GTM-MWCCJP8Z";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              gtag('consent', 'default', {
                'ad_storage': 'denied',
                'analytics_storage': 'denied',
                'ad_user_data': 'denied',
                'ad_personalization': 'denied',
                'wait_for_update': 500
              });
              gtag('set', 'ads_data_redaction', true);
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            title="Google Tag Manager"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
