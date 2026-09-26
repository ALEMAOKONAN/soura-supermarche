import { NextResponse } from "next/server";
import { creerClientSupabaseServeur } from "@/lib/supabase/server";
import { creerClientSupabaseAdmin } from "@/lib/supabase/admin";
import { estRole } from "@/lib/roles";
import { emailInterne, estIdentifiantValide, normaliserIdentifiant } from "@/lib/identifiant";

export async function POST(request: Request) {
  const supabase = await creerClientSupabaseServeur();

  // 1. Qui appelle ? Vérification de session côté serveur (impossible à
  // falsifier depuis le navigateur, contrairement à un simple champ caché).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erreur: "Non authentifié." }, { status: 401 });
  }

  // 2. Cet utilisateur est-il bien admin_org ? Seul ce rôle peut créer
  // des comptes — un gérant de magasin ou un caissier reçoit un refus net.
  const { data: profilAppelant } = await supabase
    .from("utilisateurs")
    .select("organisation_id, role")
    .eq("id", user.id)
    .single();

  if (!profilAppelant || profilAppelant.role !== "admin_org") {
    return NextResponse.json(
      { erreur: "Seul un administrateur peut créer un compte employé." },
      { status: 403 }
    );
  }

  const corps = await request.json();
  const { mot_de_passe, nom_complet, role, magasin_id } = corps;
  const emailSaisi: string = (corps.email ?? "").trim().toLowerCase();
  const identifiant: string = normaliserIdentifiant(corps.identifiant ?? "");

  if (!mot_de_passe || !nom_complet || !role || !magasin_id) {
    return NextResponse.json({ erreur: "Champs manquants." }, { status: 400 });
  }

  // Mode de connexion : identifiant OU e-mail (un seul des deux).
  if (!identifiant && !emailSaisi) {
    return NextResponse.json({ erreur: "Indiquez un identifiant ou une adresse e-mail." }, { status: 400 });
  }
  if (identifiant && !estIdentifiantValide(identifiant)) {
    return NextResponse.json(
      {
        erreur:
          "Identifiant invalide : 3 à 30 caractères, lettres minuscules sans accent, chiffres, point, tiret ou tiret bas (ex : awa.kone).",
      },
      { status: 400 }
    );
  }
  if (typeof mot_de_passe !== "string" || mot_de_passe.length < 8) {
    return NextResponse.json({ erreur: "Le mot de passe doit contenir au moins 8 caractères." }, { status: 400 });
  }

  // Pour un compte à identifiant, l'adresse de connexion est interne et invisible.
  const email = identifiant ? emailInterne(identifiant) : emailSaisi;

  if (!estRole(role)) {
    return NextResponse.json({ erreur: "Rôle invalide." }, { status: 400 });
  }

  // 3. Le magasin choisi appartient-il bien à l'organisation de l'appelant ?
  // Empêche un admin de rattacher un employé au magasin d'une autre société
  // (impossible normalement vu la RLS de lecture, mais on vérifie explicitement).
  const { data: magasin } = await supabase
    .from("magasins")
    .select("organisation_id")
    .eq("id", magasin_id)
    .single();

  if (!magasin || magasin.organisation_id !== profilAppelant.organisation_id) {
    return NextResponse.json({ erreur: "Magasin invalide." }, { status: 400 });
  }

  const admin = creerClientSupabaseAdmin();

  if (identifiant) {
    const { data: dejaPris } = await admin
      .from("utilisateurs")
      .select("id")
      .eq("identifiant", identifiant)
      .maybeSingle();
    if (dejaPris) {
      return NextResponse.json(
        { erreur: `L'identifiant « ${identifiant} » est déjà utilisé. Essayez par exemple ${identifiant}2 ou prenom.nom.` },
        { status: 409 }
      );
    }
  }

  // 4. Création du compte d'authentification (nécessite la clé service_role).
  const { data: nouvelUtilisateur, error: erreurCreation } = await admin.auth.admin.createUser({
    email,
    password: mot_de_passe,
    email_confirm: true,
  });

  if (erreurCreation || !nouvelUtilisateur.user) {
    const dejaInscrit = /already|registered|exists/i.test(erreurCreation?.message ?? "");
    return NextResponse.json(
      {
        erreur: dejaInscrit
          ? identifiant
            ? `L'identifiant « ${identifiant} » est déjà utilisé.`
            : "Cette adresse e-mail est déjà utilisée par un autre compte."
          : erreurCreation?.message ?? "Impossible de créer le compte.",
      },
      { status: 400 }
    );
  }

  // 5. Profil métier — organisation forcée à celle de l'appelant, jamais
  // prise depuis la requête, pour qu'un admin ne puisse rattacher personne
  // à une autre organisation même en modifiant la requête à la main.
  const { error: erreurProfil } = await admin.from("utilisateurs").insert({
    id: nouvelUtilisateur.user.id,
    organisation_id: profilAppelant.organisation_id,
    magasin_id,
    role,
    nom_complet,
    identifiant: identifiant || null,
    // Mot de passe choisi par le gérant : l'employé devra le remplacer.
    doit_changer_mdp: true,
  });

  if (erreurProfil) {
    // Le compte auth a été créé mais pas son profil — on annule pour ne
    // pas laisser un compte fantôme sans accès utilisable.
    await admin.auth.admin.deleteUser(nouvelUtilisateur.user.id);
    return NextResponse.json({ erreur: erreurProfil.message }, { status: 400 });
  }

  return NextResponse.json({ succes: true });
}
