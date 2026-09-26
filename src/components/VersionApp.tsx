"use client";

import { useVersionApplicationWindows } from "@/lib/application-windows";

// Informations injectées à la construction (voir next.config.ts)
const VERSION = process.env.NEXT_PUBLIC_VERSION_APP ?? "?";
const DATE = process.env.NEXT_PUBLIC_DATE_VERSION;
const COMMIT = process.env.NEXT_PUBLIC_COMMIT_VERSION ?? "local";
const ENVIRONNEMENT = process.env.NEXT_PUBLIC_ENVIRONNEMENT ?? "local";

// Fuseau fixe : même affichage sur le serveur et sur tous les postes.
const dateLisible = DATE
  ? new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Abidjan",
    }).format(new Date(DATE))
  : null;

export default function VersionApp({ className = "" }: { className?: string }) {
  // null côté serveur, valeur réelle une fois la page ouverte sur le poste.
  const versionExe = useVersionApplicationWindows();

  const detailSite =
    ENVIRONNEMENT === "local" ? "développement local" : [dateLisible, COMMIT].filter(Boolean).join(" · ");

  // Détails techniques visibles au survol de la souris uniquement.
  const titre = [
    `Site : V${VERSION}${detailSite ? ` (mis en ligne le ${detailSite})` : ""}`,
    versionExe ? `Application Windows : V${versionExe}` : "Ouvert dans un navigateur",
  ].join("\n");

  return (
    <p className={`text-xs ${className}`} style={{ color: "#8A8676" }} title={titre}>
      V{VERSION}
      {versionExe && <> · Windows V{versionExe}</>}
    </p>
  );
}
