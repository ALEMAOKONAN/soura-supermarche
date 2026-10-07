"use client";

import { useVersionApplicationWindows } from "@/lib/application-windows";
import Icone from "@/components/Icone";

// Visible uniquement dans l'application Windows (exe) : dans un navigateur,
// le bouton d'actualisation du navigateur fait déjà ce travail.
export default function BoutonRafraichir({
  className = "",
  couleur = "var(--couleur-marque)",
  confirmation,
}: {
  className?: string;
  couleur?: string;
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
      className={`inline-flex items-center gap-2 ${className}`}
      style={{ color: couleur }}
    >
      <Icone nom="actualiser" taille={18} />
      Actualiser
    </button>
  );
}
