"use client";

import { useState } from "react";
import Logo from "@/components/Logo";
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


  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--couleur-fond)" }}>
      <div className="w-full max-w-[440px] flex flex-col gap-8">
        <Logo />
        <div className="carte p-6 md:p-8">
        <h1 className="police-titre text-[26px] font-bold tracking-tight mb-1.5">Choisissez votre mot de passe</h1>
        <p className="text-[15px] leading-relaxed mb-7" style={{ color: "var(--couleur-texte-2)" }}>
          Le mot de passe qui vous a été communiqué est provisoire. Pour votre sécurité, remplacez-le par un mot de
          passe que vous seul connaissez.
        </p>

        <form onSubmit={enregistrer} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Nouveau mot de passe</span>
            <input
              type={afficher ? "text" : "password"}
              required
              autoFocus
              autoComplete="new-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="champ h-[52px] text-[17px]"
            />
            <span className="text-xs" style={{ color: assezLong ? "var(--couleur-succes)" : "var(--couleur-texte-3)" }}>
              {assezLong ? "✓ " : ""}8 caractères minimum, différent du mot de passe provisoire
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Confirmez le mot de passe</span>
            <input
              type={afficher ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="champ h-[52px] text-[17px]"
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
              className="text-sm rounded-[10px] px-3.5 py-2.5"
              style={{ background: "#FDE3E1", color: "var(--couleur-danger)" }}
            >
              {erreur}
            </p>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="bouton bouton-principal h-14 text-lg police-titre font-bold mt-2"
          >
            {enCours ? "Enregistrement…" : "Enregistrer et continuer"}
          </button>

          <button type="button" onClick={seDeconnecter} className="text-sm self-center" style={{ color: "var(--couleur-texte-2)" }}>
            Se déconnecter
          </button>
        </form>
        </div>
      </div>
    </main>
  );
}
