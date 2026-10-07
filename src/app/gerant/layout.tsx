"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { creerClientSupabase } from "@/lib/supabase/client";
import { chargerProfilConnecte, oublierProfilConnecte } from "@/lib/profil";
import BoutonRafraichir from "@/components/BoutonRafraichir";
import Icone, { type NomIcone } from "@/components/Icone";
import Logo from "@/components/Logo";
import { LIBELLES_ROLE, PAGES_GESTION, estRole, peutUtiliserCaisse, type Role } from "@/lib/roles";

const ICONES: Record<string, NomIcone> = {
  "/gerant": "tableau",
  "/gerant/produits": "produits",
  "/gerant/fournisseurs": "fournisseurs",
  "/gerant/employes": "employes",
};

function initiales(nom: string) {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join("");
}

function BoutonsBasDeMenu({ role, onNaviguer }: { role: Role | null; onNaviguer?: () => void }) {
  return (
    <>
      {role && peutUtiliserCaisse(role) && (
        <Link
          href="/caisse"
          onClick={onNaviguer}
          className="bouton bouton-accent justify-start mb-1"
        >
          <Icone nom="caisse" />
          Ouvrir la caisse
        </Link>
      )}
      <BoutonRafraichir
        className="h-10 px-3 rounded-[10px] text-sm text-left hover:bg-[var(--couleur-marque-claire)]"
        couleur="var(--couleur-sur-marque)"
      />
      <button
        onClick={async () => {
          const supabase = creerClientSupabase();
          await supabase.auth.signOut();
          oublierProfilConnecte();
          window.location.href = "/";
        }}
        className="h-10 px-3 rounded-[10px] text-sm text-left inline-flex items-center gap-2 hover:bg-[var(--couleur-marque-claire)]"
        style={{ color: "var(--couleur-sur-marque)" }}
      >
        <Icone nom="sortie" taille={18} />
        Déconnexion
      </button>
    </>
  );
}

function LiensMenu({
  liens,
  pathname,
  onNaviguer,
}: {
  liens: typeof PAGES_GESTION;
  pathname: string;
  onNaviguer?: () => void;
}) {
  return (
    <>
      {liens.map((lien) => {
        const actif = pathname === lien.href;
        return (
          <Link
            key={lien.href}
            href={lien.href}
            onClick={onNaviguer}
            aria-current={actif ? "page" : undefined}
            className={`flex items-center gap-3 h-11 px-3 rounded-[10px] text-[15px] transition-colors ${
              actif ? "font-semibold" : "font-medium hover:bg-[var(--couleur-marque-claire)]"
            }`}
            style={{
              background: actif ? "#FFFFFF" : undefined,
              color: actif ? "var(--couleur-marque)" : "var(--couleur-sur-marque)",
            }}
          >
            <Icone nom={ICONES[lien.href] ?? "tableau"} />
            {lien.label}
          </Link>
        );
      })}
    </>
  );
}

export default function LayoutGerant({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [nomUtilisateur, setNomUtilisateur] = useState("");

  // Rôle de la personne connectée : le menu n'affiche que ses écrans.
  useEffect(() => {
    async function chargerRole() {
      const profil = await chargerProfilConnecte(creerClientSupabase());
      if (profil && estRole(profil.role)) {
        setRole(profil.role);
        setNomUtilisateur(profil.nom_complet);
      }
    }
    chargerRole();
  }, []);

  const liens = role ? PAGES_GESTION.filter((p) => p.roles.includes(role)) : [];

  const blocUtilisateur = role && (
    <div className="flex items-center gap-3 px-2.5 pb-3">
      <span
        aria-hidden
        className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
        style={{ background: "var(--couleur-menthe)", color: "var(--couleur-marque)" }}
      >
        {initiales(nomUtilisateur)}
      </span>
      <p className="flex flex-col text-sm font-semibold leading-snug text-white min-w-0">
        <span className="truncate">{nomUtilisateur}</span>
        <span className="text-xs font-medium" style={{ color: "var(--couleur-sur-marque-2)" }}>
          {LIBELLES_ROLE[role]}
        </span>
      </p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: "var(--couleur-fond)" }}>
      {/* Barre du haut — petit écran (tablette/mobile) */}
      <div className="md:hidden flex items-center justify-between h-16 px-4" style={{ background: "var(--couleur-marque)" }}>
        <Logo surFonce />
        <button
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOuvert}
          onClick={() => setMenuOuvert((v) => !v)}
          className="w-11 h-11 flex items-center justify-center rounded-[10px] text-white"
        >
          <Icone nom={menuOuvert ? "fermer" : "menu"} taille={24} />
        </button>
      </div>

      {/* Menu déroulant sur mobile */}
      {menuOuvert && (
        <nav
          aria-label="Menu de gestion"
          className="md:hidden flex flex-col gap-1 px-3 pb-4"
          style={{ background: "var(--couleur-marque)" }}
        >
          <LiensMenu liens={liens} pathname={pathname} onNaviguer={() => setMenuOuvert(false)} />
          <div className="flex flex-col gap-1 pt-3 mt-2 border-t" style={{ borderColor: "var(--couleur-marque-trait)" }}>
            {blocUtilisateur}
            <BoutonsBasDeMenu role={role} onNaviguer={() => setMenuOuvert(false)} />
          </div>
        </nav>
      )}

      {/* Barre latérale — à partir des tablettes larges */}
      <aside
        className="hidden md:flex w-[272px] shrink-0 flex-col px-3.5 py-5 sticky top-0 h-screen"
        style={{ background: "var(--couleur-marque)" }}
      >
        <div className="px-2.5 pb-6">
          <Logo surFonce />
        </div>

        <nav aria-label="Menu de gestion" className="flex-1 flex flex-col gap-1">
          <LiensMenu liens={liens} pathname={pathname} />
        </nav>

        <div className="pt-5 flex flex-col gap-1 border-t" style={{ borderColor: "var(--couleur-marque-trait)" }}>
          {blocUtilisateur}
          <BoutonsBasDeMenu role={role} />
        </div>
      </aside>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
