import { NextResponse } from "next/server";
import { creerClientSupabaseServeur } from "@/lib/supabase/server";
import { creerClientSupabaseAdmin } from "@/lib/supabase/admin";

// ----------------------------------------------------------------------------
// Changement de son PROPRE mot de passe par l'utilisateur connecté.
// Lève l'obligation de changement posée à la création du compte ou après une
// réinitialisation par le gérant.
// ----------------------------------------------------------------------------
export async function POST(request: Request) {
  const supabase = await creerClientSupabaseServeur();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erreur: "Session expirée, reconnectez-vous." }, { status: 401 });
  }

  const { mot_de_passe } = await request.json();

  if (typeof mot_de_passe !== "string" || mot_de_passe.length < 8) {
    return NextResponse.json(
      { erreur: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }

  // Changement via la session de l'utilisateur lui-même (et non la clé admin) :
  // Supabase refuse ainsi automatiquement un mot de passe identique à l'ancien.
  const { error } = await supabase.auth.updateUser({ password: mot_de_passe });

  if (error) {
    const identique = /same|different/i.test(error.message) || error.code === "same_password";
    const faible = error.code === "weak_password";
    return NextResponse.json(
      {
        erreur: identique
          ? "Choisissez un mot de passe différent de celui qui vous a été communiqué."
          : faible
            ? "Ce mot de passe est trop simple. Mélangez lettres et chiffres."
            : error.message || "Impossible de modifier le mot de passe.",
      },
      { status: 400 }
    );
  }

  // Obligation levée. La clé admin est nécessaire : un employé n'a pas le droit
  // de modifier sa propre fiche (il pourrait sinon changer son rôle).
  const admin = creerClientSupabaseAdmin();
  const { error: erreurFiche } = await admin
    .from("utilisateurs")
    .update({ doit_changer_mdp: false })
    .eq("id", user.id);

  if (erreurFiche) {
    return NextResponse.json(
      { erreur: "Mot de passe changé, mais la mise à jour du compte a échoué. Réessayez." },
      { status: 500 }
    );
  }

  return NextResponse.json({ succes: true });
}
