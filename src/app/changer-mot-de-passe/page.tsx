"use client";

import { useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";

export default function PageChangerMotDePasse() {
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [afficher, setAfficher] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const assezLong = motDePasse.length >= 8;
  const identiques = motDePasse.length > 0 && motDePasse === confirmation;

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (!assezLong) {
      setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (!identiques) {
      setErreur("Les deux mots de passe ne sont pas identiques.");
      return;
    }

    setEnCours(true);
    const reponse = await fetch("/api/mot-de-passe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mot_de_passe: motDePasse }),
    });
    const resultat = await reponse.json();

    if (!reponse.ok) {
      setEnCours(false);
      setErreur(resultat.erreur ?? "Impossible de modifier le mot de passe.");
      return;
    }

    // Nouveau jeton de connexion, qui ne porte plus l'obligation de changement,
    // puis direction l'écran de travail habituel (caisse ou tableau de bord).
    const supabase = creerClientSupabase();
    await supabase.auth.refreshSession();
    window.location.href = "/";
  }

  async function seDeconnecter() {
    const supabase = creerClientSupabase();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const champStyle = { borderColor: "var(--couleur-bordure)" };

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--couleur-fond)" }}>
      <div className="w-full max-w-sm">
        <p className="police-titre text-xl font-bold mb-10" style={{ color: "var(--couleur-marque)" }}>
          SOURA Marché
        </p>

        <h1 className="police-titre text-2xl font-semibold mb-1">Choisissez votre mot de passe</h1>
        <p className="text-sm mb-8" style={{ color: "#6B6858" }}>
          Le mot de passe qui vous a été communiqué est provisoire. Pour votre sécurité, remplacez-le par un mot de
          passe que vous seul connaissez.
        </p>

        <form onSubmit={enregistrer} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nouveau mot de passe</span>
            <input
              type={afficher ? "text" : "password"}
              required
              autoFocus
              autoComplete="new-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="h-11 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
              style={champStyle}
            />
            <span className="text-xs" style={{ color: assezLong ? "var(--couleur-succes)" : "#8A8676" }}>
              {assezLong ? "✓ " : ""}8 caractères minimum, différent du mot de passe provisoire
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Confirmez le mot de passe</span>
            <input
              type={afficher ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="h-11 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
              style={champStyle}
            />
            {confirmation.length > 0 && (
              <span className="text-xs" style={{ color: identiques ? "var(--couleur-succes)" : "var(--couleur-danger)" }}>
                {identiques ? "✓ Les deux mots de passe sont identiques" : "Les deux mots de passe sont différents"}
              </span>
            )}
          </label>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={afficher} onChange={(e) => setAfficher(e.target.checked)} />
            Afficher les mots de passe
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
            {enCours ? "Enregistrement…" : "Enregistrer et continuer"}
          </button>

          <button type="button" onClick={seDeconnecter} className="text-sm self-center" style={{ color: "#6B6858" }}>
            Se déconnecter
          </button>
        </form>
      </div>
    </main>
  );
}
