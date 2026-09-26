// ============================================================================
// Rôles et accès aux écrans — source unique, utilisée à la fois par le
// middleware (qui bloque côté serveur) et par le menu (qui n'affiche que les
// écrans autorisés). Les deux ne peuvent donc jamais se contredire.
// ============================================================================

export const ROLES = ["admin_org", "gerant_magasin", "gestionnaire_stock", "caissier"] as const;
export type Role = (typeof ROLES)[number];

export const LIBELLES_ROLE: Record<Role, string> = {
  admin_org: "Administrateur",
  gerant_magasin: "Gérant de magasin",
  gestionnaire_stock: "Gestionnaire de stock",
  caissier: "Caissier",
};

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === "string" && (ROLES as readonly string[]).includes(valeur);
}

// Écran d'arrivée après la connexion
export function accueilDuRole(role: string | undefined): string {
  if (role === "caissier") return "/caisse";
  if (role === "gestionnaire_stock") return "/gerant/produits";
  return "/gerant";
}

// Écrans de gestion, avec les rôles qui y ont droit
export const PAGES_GESTION: { href: string; label: string; roles: Role[] }[] = [
  { href: "/gerant", label: "Tableau de bord", roles: ["admin_org", "gerant_magasin"] },
  { href: "/gerant/produits", label: "Produits et stock", roles: ["admin_org", "gerant_magasin", "gestionnaire_stock"] },
  { href: "/gerant/fournisseurs", label: "Fournisseurs", roles: ["admin_org", "gerant_magasin", "gestionnaire_stock"] },
  { href: "/gerant/employes", label: "Employés", roles: ["admin_org"] },
];

export function peutUtiliserCaisse(role: string | undefined): boolean {
  return role !== "gestionnaire_stock";
}

// Le rôle peut-il ouvrir cet écran ? (utilisé par le middleware)
export function peutAcceder(role: string | undefined, chemin: string): boolean {
  if (chemin === "/caisse" || chemin.startsWith("/caisse/")) return peutUtiliserCaisse(role);

  if (chemin === "/gerant" || chemin.startsWith("/gerant/")) {
    // Page la plus précise correspondant au chemin
    const page = [...PAGES_GESTION]
      .sort((a, b) => b.href.length - a.href.length)
      .find((p) => chemin === p.href || chemin.startsWith(`${p.href}/`));
    if (!page) return false;
    // Ancien jeton sans rôle : même tolérance qu'avant, sauf pour les employés
    if (!estRole(role)) return page.href !== "/gerant/employes";
    return page.roles.includes(role);
  }

  return true;
}
