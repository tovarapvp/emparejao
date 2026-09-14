import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pareo — Sorteos de parejas en vivo",
  description: "Define el cupo, invita a tu grupo y revela todas las parejas al mismo tiempo.",
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
