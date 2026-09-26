// Numéro de version affiché à côté du nom de l'application (ex : V1.0.0).
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

const detail =
  ENVIRONNEMENT === "local" ? "développement local" : [dateLisible, COMMIT].filter(Boolean).join(" · ");

export default function VersionApp({
  className = "",
  couleur = "#8A8676",
}: {
  className?: string;
  couleur?: string;
}) {
  return (
    <span
      className={`ml-2 align-middle text-xs font-normal tracking-normal ${className}`}
      style={{ color: couleur }}
      title={`Version ${VERSION}${detail ? ` (mise en ligne : ${detail})` : ""}`}
    >
      V{VERSION}
    </span>
  );
}
