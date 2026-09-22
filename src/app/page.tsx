"use client";

import { useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";

export default function PageConnexion() {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);

    const supabase = creerClientSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });

    setEnCours(false);

    if (error) {
      setErreur("Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.");
      return;
    }

    window.location.href = "/caisse";
  }

  return (
    <main className="min-h-screen grid grid-cols-1 md:grid-cols-[minmax(0,420px)_1fr]">
      {/* Panneau de marque — motif ticket de caisse, pas un dégradé générique */}
      <section
        className="hidden md:flex flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "var(--couleur-marque)" }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #fff 0px, #fff 2px, transparent 2px, transparent 14px)",
          }}
        />
        <div className="relative">
          <p className="police-titre text-2xl font-bold text-white tracking-tight">
            SOURA Marché
          </p>
          <p className="text-white/60 text-sm mt-1">Gestion de supermarché</p>
        </div>

        <div className="relative">
          <p className="police-titre text-white text-3xl leading-snug font-semibold max-w-xs">
            Chaque article scanné, chaque F compté.
          </p>
          <p className="text-white/50 text-sm mt-4">
            Caisse, stock et fournisseurs dans un seul outil.
          </p>
        </div>
      </section>

      {/* Formulaire */}
      <section className="flex items-center justify-center p-6 md:p-16">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-10">
            <p className="police-titre text-xl font-bold" style={{ color: "var(--couleur-marque)" }}>
              SOURA Marché
            </p>
          </div>

          <h1 className="police-titre text-2xl font-semibold mb-1">Connexion</h1>
          <p className="text-sm mb-8" style={{ color: "#6B6858" }}>
            Accédez à votre poste de caisse ou à la gestion du magasin.
          </p>

          <form onSubmit={seConnecter} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Adresse e-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@votresupermarche.com"
                className="h-11 px-3 rounded-md border bg-white text-sm outline-none transition-colors focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Mot de passe</span>
              <input
                type="password"
                required
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="••••••••••••"
                className="h-11 px-3 rounded-md border bg-white text-sm outline-none transition-colors focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>

            {erreur && (
              <p
                role="alert"
                className="text-sm rounded-md px-3 py-2"
                style={{ background: "#FBEAE8", color: "var(--couleur-danger)" }}
              >
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={enCours}
              className="h-11 rounded-md font-medium text-white transition-opacity disabled:opacity-60 mt-2"
              style={{ background: "var(--couleur-marque)" }}
            >
              {enCours ? "Connexion en cours…" : "Se connecter"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
