"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { creerClientSupabase } from "@/lib/supabase/client";
import VersionApp from "@/components/VersionApp";

const LIENS = [
  { href: "/gerant", label: "Tableau de bord" },
  { href: "/gerant/produits", label: "Produits" },
  { href: "/gerant/fournisseurs", label: "Fournisseurs" },
  { href: "/gerant/employes", label: "Employés" },
];

function BoutonsBasDeMenu({ onNaviguer }: { onNaviguer?: () => void }) {
  return (
    <>
      <a
        href="/caisse"
        onClick={onNaviguer}
        className="px-3 py-2 rounded-md text-sm font-semibold"
        style={{ color: "var(--couleur-accent)" }}
      >
        Caisse →
      </a>
      <button
        onClick={async () => {
          const supabase = creerClientSupabase();
          await supabase.auth.signOut();
          window.location.href = "/";
        }}
        className="px-3 py-2 rounded-md text-sm text-left"
        style={{ color: "#6B6858" }}
      >
        Déconnexion
      </button>
    </>
  );
}

export default function LayoutGerant({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const lienStyle = (actif: boolean) => ({
    background: actif ? "var(--couleur-marque)" : "transparent",
    color: actif ? "white" : "var(--couleur-texte)",
  });

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: "var(--couleur-fond)" }}>
      {/* Barre du haut — visible uniquement sur petit écran (tablette/mobile) */}
      <div
        className="md:hidden flex items-center justify-between h-14 px-4 border-b"
        style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
      >
        <p className="police-titre font-semibold" style={{ color: "var(--couleur-marque)" }}>
          SOURA Marché
        </p>
        <button
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setMenuOuvert((v) => !v)}
          className="text-2xl leading-none px-2"
          style={{ color: "var(--couleur-marque)" }}
        >
          {menuOuvert ? "✕" : "☰"}
        </button>
      </div>

      {/* Menu déroulant plein écran sur mobile */}
      {menuOuvert && (
        <nav
          className="md:hidden flex flex-col border-b"
          style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
        >
          {LIENS.map((lien) => (
            <a
              key={lien.href}
              href={lien.href}
              onClick={() => setMenuOuvert(false)}
              className="px-4 py-3 text-sm font-medium border-b"
              style={{ ...lienStyle(pathname === lien.href), borderColor: "var(--couleur-bordure)" }}
            >
              {lien.label}
            </a>
          ))}
          <div className="flex flex-col px-1 py-2">
            <BoutonsBasDeMenu onNaviguer={() => setMenuOuvert(false)} />
            <VersionApp className="px-3 pt-2" />
          </div>
        </nav>
      )}

      {/* Barre latérale — visible uniquement à partir de md (tablette large / ordinateur) */}
      <aside
        className="hidden md:flex w-60 shrink-0 flex-col border-r"
        style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
      >
        <div className="h-16 px-5 flex items-center border-b" style={{ borderColor: "var(--couleur-bordure)" }}>
          <p className="police-titre font-semibold" style={{ color: "var(--couleur-marque)" }}>
            SOURA Marché
          </p>
        </div>

        <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
          {LIENS.map((lien) => (
            <a
              key={lien.href}
              href={lien.href}
              className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
              style={lienStyle(pathname === lien.href)}
            >
              {lien.label}
            </a>
          ))}
        </nav>

        <div className="p-3 border-t flex flex-col gap-1" style={{ borderColor: "var(--couleur-bordure)" }}>
          <BoutonsBasDeMenu />
          <VersionApp className="px-3 pt-2" />
        </div>
      </aside>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
