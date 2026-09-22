import type { Metadata } from "next";
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
