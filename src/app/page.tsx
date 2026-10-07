"use client";

import { useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import { versEmailDeConnexion } from "@/lib/identifiant";
import Logo from "@/components/Logo";

export default function PageConnexion() {
  const [saisie, setSaisie] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mdpVisible, setMdpVisible] = useState(false);

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);

    const supabase = creerClientSupabase();
    // Accepte un e-mail ("awa@exemple.com") ou un identifiant ("awa.kone").
    const { error } = await supabase.auth.signInWithPassword({
      email: versEmailDeConnexion(saisie),
      password: motDePasse,
    });

    setEnCours(false);

    if (error) {
      setErreur("Identifiant ou mot de passe incorrect.");
      return;
    }

    // Le middleware décide de la destination selon le rôle (caissier → caisse,
    // gérant/admin → tableau de bord) — pas besoin de le recalculer ici.
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen flex flex-col md:flex-row">
      {/* Panneau de marque */}
      <section
        className="relative overflow-hidden flex flex-col justify-between gap-10 px-6 py-8 md:p-14 md:flex-1"
        style={{ background: "var(--couleur-marque)" }}
      >
        <div
          aria-hidden
          className="absolute rounded-full hidden md:block"
          style={{ right: -120, bottom: -120, width: 420, height: 420, border: "56px solid var(--couleur-marque-claire)" }}
        />
        <div
          aria-hidden
          className="absolute rounded-full hidden md:block"
          style={{ right: 120, bottom: 140, width: 90, height: 90, background: "var(--couleur-accent)" }}
        />
        <div className="relative">
          <Logo surFonce taille="grand" />
        </div>

        <div className="relative hidden md:flex flex-col gap-5 max-w-md">
          <p className="police-titre text-white text-5xl leading-[1.08] font-bold tracking-tight">
            Chaque article scanné, chaque franc compté.
          </p>
          <p className="text-lg leading-relaxed" style={{ color: "var(--couleur-sur-marque)" }}>
            La caisse, le stock et les fournisseurs de votre magasin, au même endroit, même quand internet coupe.
          </p>
        </div>

        <div className="relative hidden md:flex flex-wrap gap-2.5">
          {["Caisse rapide", "Mode hors ligne", "Mobile Money"].map((t) => (
            <span
              key={t}
              className="h-9 px-3.5 rounded-full border inline-flex items-center text-sm"
              style={{ borderColor: "var(--couleur-marque-trait)", color: "var(--couleur-sur-marque)" }}
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Formulaire */}
      <section className="flex-1 flex items-center justify-center px-6 py-12 md:p-16">
        <div className="w-full max-w-[400px]">
          <h1 className="police-titre text-[32px] font-bold tracking-tight mb-1.5">Connexion</h1>
          <p className="text-base mb-8" style={{ color: "var(--couleur-texte-2)" }}>
            Ouvrez votre caisse ou la gestion du magasin.
          </p>

          <form onSubmit={seConnecter} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">Identifiant ou adresse e-mail</span>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                placeholder="awa.kone ou vous@votresupermarche.com"
                className="champ h-[54px] text-[17px]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">Mot de passe</span>
              <span className="relative flex">
                <input
                  type={mdpVisible ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  placeholder="••••••••••••"
                  className="champ h-[54px] text-[17px] w-full pr-24"
                />
                <button
                  type="button"
                  onClick={() => setMdpVisible((v) => !v)}
                  className="absolute right-1.5 top-1.5 h-[42px] px-3 rounded-lg text-sm font-semibold"
                  style={{ color: "var(--couleur-marque)" }}
                >
                  {mdpVisible ? "Masquer" : "Afficher"}
                </button>
              </span>
            </label>

            {erreur && (
              <p role="alert" className="text-sm rounded-[10px] px-3.5 py-2.5" style={{ background: "#FDE3E1", color: "var(--couleur-danger)" }}>
                {erreur}
              </p>
            )}

            <button type="submit" disabled={enCours} className="bouton bouton-principal h-14 text-lg police-titre font-bold mt-1">
              {enCours ? "Connexion en cours…" : "Se connecter"}
            </button>

            <p className="text-sm leading-relaxed mt-1" style={{ color: "var(--couleur-texte-2)" }}>
              Première connexion ? Utilisez le mot de passe provisoire remis par votre gérant. Vous choisirez le vôtre juste après.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
