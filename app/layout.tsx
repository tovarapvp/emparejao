import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://emparejao.tovarapvp.workers.dev";
const SITE_TITLE = "Emparejao — Sorteos de parejas en vivo";
const SITE_DESCRIPTION =
  "Define el cupo, invita a tu grupo y revela todas las parejas al mismo tiempo.";
const SOCIAL_TITLE = "Emparejao — Sorteos en vivo | Live pairing";
const SOCIAL_DESCRIPTION =
  "Crea una sala y revela las parejas en vivo. Create a room and reveal every match live.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  applicationName: "Emparejao",
  openGraph: {
    type: "website",
    locale: "es_VE",
    alternateLocale: ["en_US"],
    url: "/",
    siteName: "Emparejao",
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Emparejao: sorteos de parejas en vivo en español e inglés",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: SOCIAL_DESCRIPTION,
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Emparejao",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
