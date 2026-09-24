// ============================================================================
// Connexion par identifiant OU par e-mail.
// Supabase exige une adresse e-mail pour chaque compte. Les employés qui se
// connectent avec un identifiant (ex : "awa.kone") reçoivent donc une adresse
// interne construite automatiquement ("awa.kone@<DOMAINE_INTERNE>"), qui ne
// reçoit jamais de courrier. Ils ne la voient ni ne la tapent jamais.
// ============================================================================

// Domaine des adresses internes. Ne pas modifier une fois des comptes créés :
// les employés existants ne pourraient plus se connecter.
export const DOMAINE_INTERNE = "soura-marche.vercel.app";

const FORMAT_IDENTIFIANT = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normaliserIdentifiant(saisie: string): string {
  return saisie.trim().toLowerCase();
}

export function estIdentifiantValide(identifiant: string): boolean {
  return FORMAT_IDENTIFIANT.test(identifiant);
}

// Ce que la personne tape dans le champ de connexion → adresse envoyée à Supabase.
export function versEmailDeConnexion(saisie: string): string {
  const valeur = normaliserIdentifiant(saisie);
  return valeur.includes("@") ? valeur : `${valeur}@${DOMAINE_INTERNE}`;
}

export function emailInterne(identifiant: string): string {
  return `${normaliserIdentifiant(identifiant)}@${DOMAINE_INTERNE}`;
}
