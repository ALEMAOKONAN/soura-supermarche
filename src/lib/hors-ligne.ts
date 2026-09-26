// ============================================================================
// Mode hors ligne — tout ce qui est gardé sur le poste de caisse :
//   - le catalogue produits (pour chercher/scanner sans connexion)
//   - le profil du caissier (magasin, nom) pour encaisser sans connexion
//   - la file des ventes en attente d'envoi
// Stockage : localStorage du navigateur (ou de l'application Windows).
// ============================================================================

export type ProduitCatalogue = {
  id: string;
  nom: string;
  code_barre: string | null;
  unite: "piece" | "kg" | "g" | "l" | "ml";
  prix_vente: number;
  est_pese: boolean;
};

export type ProfilCaisse = {
  role: string;
  organisation_id: string;
  magasin_id: string;
  nomCaissier: string;
  nomMagasin: string;
  adresse: string;
};

export type VenteEnAttente = {
  id: string; // identifiant généré sur le poste : garantit l'absence de doublon
  magasin_id: string;
  mode_paiement: string;
  lignes: { produit_id: string; quantite: number; prix_unitaire: number }[];
  date: string; // date réelle de la vente (ISO)
  total: number;
  derniereErreur?: string; // erreur refusée par la base (hors coupure réseau)
};

const CLE_CATALOGUE = "soura_catalogue_v1";
const CLE_PROFIL = "soura_profil_caisse_v1";
const CLE_FILE = "soura_ventes_en_attente_v1";

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : defaut;
  } catch {
    return defaut;
  }
}

function ecrire(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Stockage plein ou indisponible : on ne bloque jamais la caisse pour ça.
  }
}

// --- Catalogue ---------------------------------------------------------------
// Copie en mémoire : le catalogue n'est relu depuis le stockage qu'une fois,
// la recherche à chaque frappe reste instantanée même avec des milliers d'articles.
let catalogueEnMemoire: { produits: ProduitCatalogue[]; nomsMinuscules: string[] } | null = null;

function preparer(produits: ProduitCatalogue[]) {
  catalogueEnMemoire = { produits, nomsMinuscules: produits.map((p) => p.nom.toLowerCase()) };
  return catalogueEnMemoire;
}

export const lireCatalogue = () => (catalogueEnMemoire ?? preparer(lire<ProduitCatalogue[]>(CLE_CATALOGUE, []))).produits;

export function enregistrerCatalogue(produits: ProduitCatalogue[]) {
  preparer(produits);
  ecrire(CLE_CATALOGUE, produits);
}

export function chercherDansCatalogue(terme: string, limite = 8): ProduitCatalogue[] {
  const brut = terme.trim();
  const t = brut.toLowerCase();
  if (t.length < 2) return [];
  const { produits, nomsMinuscules } = catalogueEnMemoire ?? preparer(lire<ProduitCatalogue[]>(CLE_CATALOGUE, []));

  // Code-barre exact en premier : un scan tombe toujours sur le bon article.
  const resultats = produits.filter((p) => p.code_barre === brut);
  for (let i = 0; i < produits.length && resultats.length < limite; i++) {
    if (nomsMinuscules[i].includes(t) && produits[i].code_barre !== brut) resultats.push(produits[i]);
  }
  return resultats.slice(0, limite);
}

// --- Profil du caissier ------------------------------------------------------
export const lireProfil = () => lire<ProfilCaisse | null>(CLE_PROFIL, null);
export const enregistrerProfil = (profil: ProfilCaisse) => ecrire(CLE_PROFIL, profil);

// --- File des ventes en attente ----------------------------------------------
export const lireFile = () => lire<VenteEnAttente[]>(CLE_FILE, []);

export function ajouterAFile(vente: VenteEnAttente) {
  const file = lireFile();
  if (!file.some((v) => v.id === vente.id)) file.push(vente);
  ecrire(CLE_FILE, file);
}

export function retirerDeFile(id: string) {
  ecrire(CLE_FILE, lireFile().filter((v) => v.id !== id));
}

export function marquerErreur(id: string, message: string) {
  ecrire(
    CLE_FILE,
    lireFile().map((v) => (v.id === id ? { ...v, derniereErreur: message } : v))
  );
}

// --- Réseau ------------------------------------------------------------------
// Distingue une coupure réseau (la vente doit partir en file d'attente) d'un
// vrai refus de la base (qui doit être affiché à la caissière).
export function estErreurReseau(erreur: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message =
    erreur instanceof Error
      ? erreur.message
      : typeof erreur === "object" && erreur && "message" in erreur
        ? String((erreur as { message: unknown }).message)
        : String(erreur);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|err_internet/i.test(
    message
  );
}

export function nouvelIdentifiant(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Repli pour les très vieux navigateurs
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
