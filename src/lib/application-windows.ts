"use client";

import { useSyncExternalStore } from "react";

// ============================================================================
// Détection de l'application Windows (exe SOURA Marché Caisse).
// L'exe expose `window.sourapos` avant le chargement de la page.
// ============================================================================

type PontCaisse = { estApplicationCaisse?: boolean; versionApplication?: string };

// Version de l'exe, ou null dans un navigateur normal.
function lireVersionApplication(): string | null {
  if (typeof window === "undefined") return null;
  const pont = (window as unknown as { sourapos?: PontCaisse }).sourapos;
  if (!pont?.estApplicationCaisse) return null;
  if (pont.versionApplication) return pont.versionApplication;
  // Première version de l'exe : version lue dans l'identifiant du navigateur
  const trouve = navigator.userAgent.match(/(\d+\.\d+\.\d+) Chrome\/[\d.]+ Electron\//);
  return trouve ? trouve[1] : "1.0.0";
}

// Après l'affichage initial (identique serveur et poste), on demande à React
// de relire la valeur une fois : c'est ce qui fait apparaître les éléments
// propres à l'exe. Sans ce signal, React garderait la valeur du serveur.
function sAbonner(notifier: () => void) {
  const minuteur = setTimeout(notifier, 0);
  return () => clearTimeout(minuteur);
}

export function useVersionApplicationWindows(): string | null {
  return useSyncExternalStore(sAbonner, lireVersionApplication, () => null);
}
