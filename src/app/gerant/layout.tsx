"use client";

import { usePathname } from "next/navigation";
import { creerClientSupabase } from "@/lib/supabase/client";

const LIENS = [
  { href: "/gerant", label: "Tableau de bord" },
  { href: "/gerant/produits", label: "Produits" },
  { href: "/gerant/fournisseurs", label: "Fournisseurs" },
  { href: "/gerant/employes", label: "Employés" },
];

export default function LayoutGerant({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex" style={{ background: "var(--couleur-fond)" }}>
      {/* Barre latérale — cohérente avec la structure des autres outils SOURA */}
      <aside
        className="w-60 shrink-0 flex flex-col border-r"
        style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
      >
        <div className="h-16 px-5 flex items-center border-b" style={{ borderColor: "var(--couleur-bordure)" }}>
          <p className="police-titre font-semibold" style={{ color: "var(--couleur-marque)" }}>
            SOURA Marché
          </p>
        </div>

        <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
          {LIENS.map((lien) => {
            const actif = pathname === lien.href;
            return (
              <a
                key={lien.href}
                href={lien.href}
                className="px-3 py-2 rounded-md text-sm font-medium transition-colors"
                style={{
                  background: actif ? "var(--couleur-marque)" : "transparent",
                  color: actif ? "white" : "var(--couleur-texte)",
                }}
              >
                {lien.label}
              </a>
            );
          })}
        </nav>

        <div className="p-3 border-t flex flex-col gap-1" style={{ borderColor: "var(--couleur-bordure)" }}>
          <a
            href="/caisse"
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
        </div>
      </aside>

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
