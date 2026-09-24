import { NextResponse } from "next/server";
import { creerClientSupabaseServeur } from "@/lib/supabase/server";
import { creerClientSupabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: employeId } = await params;
  const supabase = await creerClientSupabaseServeur();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });
  }

  const { data: profilAppelant } = await supabase
    .from("utilisateurs")
    .select("organisation_id, role")
    .eq("id", user.id)
    .single();

  if (!profilAppelant || profilAppelant.role !== "admin_org") {
    return NextResponse.json(
      { erreur: "Seul un administrateur peut supprimer un compte employé." },
      { status: 403 }
    );
  }

  // On ne peut pas se supprimer soi-même — évite qu'un admin se verrouille
  // lui-même dehors par erreur (surtout s'il est seul admin de l'organisation).
  if (employeId === user.id) {
    return NextResponse.json(
      { erreur: "Vous ne pouvez pas supprimer votre propre compte." },
      { status: 400 }
    );
  }

  const admin = creerClientSupabaseAdmin();

  // Vérifie que l'employé appartient bien à la même organisation avant de
  // toucher à quoi que ce soit (l'appelant ne doit jamais pouvoir supprimer
  // le compte de quelqu'un d'une autre entreprise, même en trafiquant l'URL).
  const { data: employeCible } = await admin
    .from("utilisateurs")
    .select("organisation_id")
    .eq("id", employeId)
    .single();

  if (!employeCible || employeCible.organisation_id !== profilAppelant.organisation_id) {
    return NextResponse.json({ erreur: "Employé introuvable." }, { status: 404 });
  }

  // Supprimer le compte d'authentification supprime aussi la ligne
  // `utilisateurs` par cascade (on delete cascade sur la clé étrangère).
  const { error } = await admin.auth.admin.deleteUser(employeId);

  if (error) {
    // Cas fréquent : l'employé a déjà des ventes/mouvements enregistrés à
    // son nom — la base refuse la suppression pour ne pas casser l'historique.
    const messageBrut = error.message ?? "";
    if (messageBrut.toLowerCase().includes("foreign key") || messageBrut.toLowerCase().includes("violates")) {
      return NextResponse.json(
        {
          erreur:
            "Cet employé a déjà des ventes ou mouvements enregistrés à son nom : impossible de le supprimer sans perdre cet historique. Utilisez plutôt \"Désactiver\".",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ erreur: messageBrut || "Suppression impossible." }, { status: 400 });
  }

  return NextResponse.json({ succes: true });
}

// ----------------------------------------------------------------------------
// Réinitialisation du mot de passe d'un employé par un administrateur.
// Utile surtout pour les comptes à identifiant, qui n'ont pas d'e-mail pour
// réinitialiser eux-mêmes leur mot de passe.
// ----------------------------------------------------------------------------
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: employeId } = await params;
  const supabase = await creerClientSupabaseServeur();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });
  }

  const { data: profilAppelant } = await supabase
    .from("utilisateurs")
    .select("organisation_id, role")
    .eq("id", user.id)
    .single();

  if (!profilAppelant || profilAppelant.role !== "admin_org") {
    return NextResponse.json(
      { erreur: "Seul un administrateur peut réinitialiser un mot de passe." },
      { status: 403 }
    );
  }

  const { mot_de_passe } = await request.json();

  if (typeof mot_de_passe !== "string" || mot_de_passe.length < 8) {
    return NextResponse.json(
      { erreur: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }

  const admin = creerClientSupabaseAdmin();

  // Même garde-fou que pour la suppression : jamais le compte d'une autre entreprise.
  const { data: employeCible } = await admin
    .from("utilisateurs")
    .select("organisation_id")
    .eq("id", employeId)
    .single();

  if (!employeCible || employeCible.organisation_id !== profilAppelant.organisation_id) {
    return NextResponse.json({ erreur: "Employé introuvable." }, { status: 404 });
  }

  const { error } = await admin.auth.admin.updateUserById(employeId, { password: mot_de_passe });

  if (error) {
    return NextResponse.json(
      { erreur: error.message || "Impossible de modifier le mot de passe." },
      { status: 400 }
    );
  }

  // Le mot de passe communiqué par le gérant est provisoire : l'employé devra
  // en choisir un nouveau à sa prochaine connexion.
  await admin.from("utilisateurs").update({ doit_changer_mdp: true }).eq("id", employeId);

  return NextResponse.json({ succes: true });
}
