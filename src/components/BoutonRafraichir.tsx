"use client";

import { useVersionApplicationWindows } from "@/lib/application-windows";

// Visible uniquement dans l'application Windows (exe) : dans un navigateur,
// le bouton d'actualisation du navigateur fait déjà ce travail.
export default function BoutonRafraichir({
  className = "",
  confirmation,
}: {
  className?: string;
  // Message à confirmer avant d'actualiser (null = pas de confirmation)
  confirmation?: () => string | null;
}) {
  const versionExe = useVersionApplicationWindows();
  if (!versionExe) return null;

  function actualiser() {
    const message = confirmation?.() ?? null;
    if (message && !window.confirm(message)) return;
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={actualiser}
      title="Actualiser la page (F5)"
      className={`inline-flex items-center gap-1.5 ${className}`}
      style={{ color: "var(--couleur-marque)" }}
    >
      <span aria-hidden className="text-base leading-none">
        ↻
      </span>
      Actualiser
    </button>
  );
}
