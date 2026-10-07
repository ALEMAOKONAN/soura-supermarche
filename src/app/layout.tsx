import type { Metadata } from "next";
// Polices embarquées dans l'application (pas de Google Fonts) : elles
// s'affichent aussi dans l'exe et hors connexion.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOURA Marché — Caisse & gestion",
  description: "Logiciel de gestion pour supermarchés : caisse, stock, fournisseurs, fidélité.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
