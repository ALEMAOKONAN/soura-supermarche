"use client";

import type { creerClientSupabase } from "@/lib/supabase/client";

// ============================================================================
// Profil de la personne connectée, chargé UNE seule fois puis partagé entre
// le menu et les écrans de gestion (avant : chaque écran refaisait deux
// allers-retours vers Supabase — vérification du compte + lecture du profil).
//
// L'identité est lue dans la session gardée sur le poste, sans appel réseau.
// La sécurité ne repose pas là-dessus : la base (RLS) filtre chaque requête,
// et le serveur contrôle la session et le rôle à chaque changement de page.
// ============================================================================

export type ProfilConnecte = {
  id: string;
  role: string;
  organisation_id: string;
  magasin_id: string | null;
  nom_complet: string;
};

type ClientSupabase = ReturnType<typeof creerClientSupabase>;

let memoire: { id: string; promesse: Promise<ProfilConnecte | null> } | null = null;

export async function chargerProfilConnecte(supabase: ClientSupabase): Promise<ProfilConnecte | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const id = session?.user.id;
  if (!id) {
    memoire = null;
    return null;
  }

  if (memoire?.id !== id) {
    const promesse = Promise.resolve(
      supabase
        .from("utilisateurs")
        .select("id, role, organisation_id, magasin_id, nom_complet")
        .eq("id", id)
        .single()
    ).then(({ data }) => (data as ProfilConnecte | null) ?? null);
    memoire = { id, promesse };
    // Échec (réseau…) : on n'en garde pas le souvenir, le prochain appel réessaiera.
    promesse.then((p) => {
      if (!p && memoire?.promesse === promesse) memoire = null;
    });
  }
  return memoire.promesse;
}

// À appeler à la déconnexion.
export function oublierProfilConnecte() {
  memoire = null;
}
