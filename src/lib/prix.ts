// ============================================================================
// Calcul des prix à partir du prix d'achat et de la marge.
// Marge exprimée en % du prix d'achat :
//   prix de vente = prix d'achat × (1 + marge / 100)
//   ex : achat 1 000 F, marge 25 % → vente 1 250 F
// Les prix sont arrondis au franc (pas de centimes en FCFA).
// ============================================================================

export type SaisiePrix = { achat: string; marge: string; vente: string };

export const PRIX_VIDE: SaisiePrix = { achat: "", marge: "", vente: "" };

function nombre(valeur: string): number | null {
  if (valeur.trim() === "") return null;
  const n = Number(valeur.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function calculerPrixVente(achat: number, marge: number): number {
  // Passage par toFixed : 850 × 1,15 vaut 977,4999… en calcul machine, il
  // doit bien donner 977,5 → 978 F, comme le calcul exact de la base.
  return Math.round(Number((achat * (1 + marge / 100)).toFixed(6)));
}

// Marge réelle obtenue pour un prix de vente donné (2 décimales max).
export function calculerMarge(achat: number, vente: number): number | null {
  if (achat <= 0) return null;
  return Number((((vente - achat) / achat) * 100).toFixed(2));
}

// Mise à jour d'un champ, avec recalcul automatique de l'autre :
// - on change l'achat ou la marge → le prix de vente se recalcule
// - on change le prix de vente     → la marge se recalcule
export function majSaisiePrix(saisie: SaisiePrix, champ: keyof SaisiePrix, valeur: string): SaisiePrix {
  const suivante = { ...saisie, [champ]: valeur };
  const achat = nombre(suivante.achat);
  const marge = nombre(suivante.marge);
  const vente = nombre(suivante.vente);

  if (champ === "vente") {
    if (achat !== null && vente !== null) {
      const m = calculerMarge(achat, vente);
      if (m !== null) suivante.marge = String(m);
    }
  } else if (achat !== null && marge !== null) {
    suivante.vente = String(calculerPrixVente(achat, marge));
  }
  return suivante;
}

export type PrixValides = { achat: number; marge: number | null; vente: number };

// Vérifie la saisie avant envoi ; renvoie un message d'erreur ou les valeurs.
export function validerSaisiePrix(saisie: SaisiePrix): { erreur: string } | { prix: PrixValides } {
  const achat = nombre(saisie.achat);
  const vente = nombre(saisie.vente);
  const marge = nombre(saisie.marge);
  if (achat === null || achat < 0) return { erreur: "Indiquez un prix d'achat valide." };
  if (vente === null || vente <= 0) return { erreur: "Indiquez un prix de vente valide." };
  return { prix: { achat, marge: marge ?? calculerMarge(achat, vente), vente: Math.round(vente) } };
}

// Informations affichées sous les champs : bénéfice par unité, vente à perte.
export function resumePrix(saisie: SaisiePrix): { benefice: number; aPerte: boolean } | null {
  const achat = nombre(saisie.achat);
  const vente = nombre(saisie.vente);
  if (achat === null || vente === null) return null;
  return { benefice: Math.round(vente - achat), aPerte: vente < achat };
}
