"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import { chargerProfilConnecte } from "@/lib/profil";
import { LIBELLES_ROLE, type Role } from "@/lib/roles";

type Employe = {
  id: string;
  nom_complet: string;
  identifiant: string | null;
  role: Role;
  actif: boolean;
  magasin_id: string;
  magasins: { nom: string } | null;
};
type Magasin = { id: string; nom: string };

// Ordre d'affichage dans les listes : du plus limité au plus étendu
const ORDRE_ROLES: Role[] = ["caissier", "gestionnaire_stock", "gerant_magasin", "admin_org"];

export default function PageEmployes() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [accesRefuse, setAccesRefuse] = useState(false);
  const [monPropreId, setMonPropreId] = useState<string | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState<string | null>(null);

  // Réinitialisation de mot de passe : un seul panneau ouvert à la fois
  const [mdpOuvertPour, setMdpOuvertPour] = useState<string | null>(null);
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [mdpEnCours, setMdpEnCours] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Nouveau compte
  const [nom, setNom] = useState("");
  const [modeConnexion, setModeConnexion] = useState<"identifiant" | "email">("identifiant");
  const [identifiant, setIdentifiant] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [role, setRole] = useState<Employe["role"]>("caissier");
  const [magasinChoisi, setMagasinChoisi] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);

  // Modification de rôle par ligne
  const [rolesModifies, setRolesModifies] = useState<Record<string, string>>({});
  const [enregistrementEnCours, setEnregistrementEnCours] = useState<string | null>(null);

  async function chargerDonnees() {
    const profil = await chargerProfilConnecte(supabase);
    if (profil) setMonPropreId(profil.id);

    if (!profil || profil.role !== "admin_org") {
      setAccesRefuse(true);
      setChargement(false);
      return;
    }

    const [{ data: dataEmployes }, { data: dataMagasins }] = await Promise.all([
      supabase
        .from("utilisateurs")
        .select("id, nom_complet, identifiant, role, actif, magasin_id, magasins(nom)")
        .order("nom_complet"),
      supabase.from("magasins").select("id, nom").eq("actif", true).order("nom"),
    ]);

    setEmployes((dataEmployes as unknown as Employe[]) ?? []);
    setMagasins(dataMagasins ?? []);
    if (dataMagasins && dataMagasins.length > 0 && !magasinChoisi) {
      setMagasinChoisi(dataMagasins[0].id);
    }
    setChargement(false);
  }

  useEffect(() => {
    chargerDonnees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function creerEmploye(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setCreationEnCours(true);

    const reponse = await fetch("/api/employes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: modeConnexion === "email" ? email : "",
        identifiant: modeConnexion === "identifiant" ? identifiant : "",
        mot_de_passe: motDePasse,
        nom_complet: nom,
        role,
        magasin_id: magasinChoisi,
      }),
    });
    const resultat = await reponse.json();
    setCreationEnCours(false);

    if (!reponse.ok) {
      setErreur(resultat.erreur ?? "Erreur lors de la création.");
      return;
    }

    setNom("");
    setEmail("");
    setIdentifiant("");
    setMotDePasse("");
    setRole("caissier");
    setMessage(
      modeConnexion === "identifiant"
        ? `Compte créé pour ${nom}. Identifiant de connexion : ${identifiant.trim().toLowerCase()}. Il devra choisir son propre mot de passe à sa première connexion.`
        : `Compte créé pour ${nom || email}. Il devra choisir son propre mot de passe à sa première connexion.`
    );
    chargerDonnees();
  }

  async function enregistrerRole(employeId: string) {
    const nouveauRole = rolesModifies[employeId];
    if (!nouveauRole) return;

    setErreur(null);
    setEnregistrementEnCours(employeId);

    const { error } = await supabase.from("utilisateurs").update({ role: nouveauRole }).eq("id", employeId);

    setEnregistrementEnCours(null);

    if (error) {
      setErreur(error.message);
      return;
    }

    setMessage("Rôle mis à jour.");
    setRolesModifies((a) => {
      const copie = { ...a };
      delete copie[employeId];
      return copie;
    });
    chargerDonnees();
  }

  async function basculerActif(employeId: string, actif: boolean) {
    setErreur(null);
    const { error } = await supabase.from("utilisateurs").update({ actif: !actif }).eq("id", employeId);
    if (error) {
      setErreur(error.message);
      return;
    }
    chargerDonnees();
  }

  // Mot de passe facile à dicter : pas de caractères qui se confondent
  // (0/o, 1/l/i), en deux groupes de 5 (ex : "k7mzp-3wqha").
  function genererMotDePasse() {
    const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
    const tirage = new Uint32Array(10);
    crypto.getRandomValues(tirage);
    const caracteres = Array.from(tirage, (n) => alphabet[n % alphabet.length]).join("");
    setNouveauMdp(`${caracteres.slice(0, 5)}-${caracteres.slice(5)}`);
  }

  function ouvrirReinitialisation(employeId: string) {
    setErreur(null);
    setMessage(null);
    setNouveauMdp("");
    setMdpOuvertPour((actuel) => (actuel === employeId ? null : employeId));
  }

  async function reinitialiserMotDePasse(employe: Employe) {
    if (nouveauMdp.length < 8) {
      setErreur("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setErreur(null);
    setMdpEnCours(true);

    const reponse = await fetch(`/api/employes/${employe.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mot_de_passe: nouveauMdp }),
    });
    const resultat = await reponse.json();
    setMdpEnCours(false);

    if (!reponse.ok) {
      setErreur(resultat.erreur ?? "Impossible de modifier le mot de passe.");
      return;
    }

    const connexion = employe.identifiant ? `identifiant « ${employe.identifiant} »` : "son adresse e-mail";
    setMessage(
      `Mot de passe provisoire de ${employe.nom_complet} : ${nouveauMdp} — à lui transmettre avec ${connexion}. Il devra le remplacer à sa prochaine connexion.`
    );
    setMdpOuvertPour(null);
    setNouveauMdp("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function supprimerEmploye(employeId: string, nomComplet: string) {
    const confirmation = window.confirm(
      `Supprimer définitivement le compte de ${nomComplet} ? Cette action est irréversible. Si cet employé a déjà traité des ventes ou des réceptions, la suppression sera refusée — désactivez-le plutôt dans ce cas.`
    );
    if (!confirmation) return;

    setErreur(null);
    setSuppressionEnCours(employeId);

    const reponse = await fetch(`/api/employes/${employeId}`, { method: "DELETE" });
    const resultat = await reponse.json();

    setSuppressionEnCours(null);

    if (!reponse.ok) {
      setErreur(resultat.erreur ?? "Suppression impossible.");
      return;
    }

    setMessage(`Compte de ${nomComplet} supprimé.`);
    chargerDonnees();
  }

  if (chargement) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--couleur-fond)" }}>
        <p style={{ color: "#8A8676" }}>Chargement…</p>
      </main>
    );
  }

  if (accesRefuse) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "var(--couleur-fond)" }}>
        <p className="police-titre text-lg font-semibold">Accès réservé aux administrateurs</p>
        <a href="/gerant" className="text-sm underline" style={{ color: "var(--couleur-marque)" }}>
          Retour au tableau de bord
        </a>
      </main>
    );
  }

  return (
    <main>
      <header
        className="flex items-center h-16 px-8 border-b"
        style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
      >
        <p className="police-titre font-semibold text-lg">Employés</p>
      </header>

      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-10">
        {erreur && (
          <p role="alert" className="text-sm rounded-md px-3 py-2" style={{ background: "#FBEAE8", color: "var(--couleur-danger)" }}>
            {erreur}
          </p>
        )}
        {message && !erreur && (
          <p className="text-sm rounded-md px-3 py-2" style={{ background: "#E9F5EE", color: "var(--couleur-succes)" }}>
            {message}
          </p>
        )}

        {/* Créer un compte */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Créer un compte employé
          </h2>
          <form onSubmit={creerEmploye} className="flex flex-col gap-3 max-w-md">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Nom complet</span>
              <input
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Se connecte avec</span>
              <div className="flex gap-2">
                {([
                  { valeur: "identifiant", libelle: "Un identifiant" },
                  { valeur: "email", libelle: "Une adresse e-mail" },
                ] as const).map((option) => (
                  <button
                    key={option.valeur}
                    type="button"
                    onClick={() => setModeConnexion(option.valeur)}
                    className="flex-1 h-10 rounded-md text-sm font-medium border"
                    style={{
                      borderColor: modeConnexion === option.valeur ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                      background: modeConnexion === option.valeur ? "var(--couleur-marque)" : "white",
                      color: modeConnexion === option.valeur ? "white" : "var(--couleur-texte)",
                    }}
                  >
                    {option.libelle}
                  </button>
                ))}
              </div>
            </div>

            {modeConnexion === "identifiant" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Identifiant</span>
                <input
                  required
                  type="text"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={identifiant}
                  onChange={(e) => setIdentifiant(e.target.value.toLowerCase().replace(/\s/g, ""))}
                  placeholder="ex : awa.kone"
                  pattern="[a-z0-9][a-z0-9._\-]{2,29}"
                  title="3 à 30 caractères : lettres minuscules sans accent, chiffres, point, tiret ou tiret bas"
                  className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                  style={{ borderColor: "var(--couleur-bordure)" }}
                />
                <span className="text-xs" style={{ color: "#8A8676" }}>
                  Lettres minuscules sans accent, chiffres, point ou tiret. C&apos;est ce que l&apos;employé tapera pour se connecter.
                </span>
              </label>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">E-mail</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                  style={{ borderColor: "var(--couleur-bordure)" }}
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Mot de passe provisoire</span>
              <input
                required
                type="text"
                minLength={8}
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="À communiquer à l'employé, à changer ensuite"
                className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-col gap-1.5 flex-1">
                <span className="text-sm font-medium">Fonction</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Employe["role"])}
                  className="h-10 px-3 rounded-md border bg-white text-sm"
                  style={{ borderColor: "var(--couleur-bordure)" }}
                >
                  {ORDRE_ROLES.map((r) => (
                    <option key={r} value={r}>{LIBELLES_ROLE[r]}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 flex-1">
                <span className="text-sm font-medium">Magasin</span>
                <select
                  value={magasinChoisi}
                  onChange={(e) => setMagasinChoisi(e.target.value)}
                  className="h-10 px-3 rounded-md border bg-white text-sm"
                  style={{ borderColor: "var(--couleur-bordure)" }}
                >
                  {magasins.map((m) => (
                    <option key={m.id} value={m.id}>{m.nom}</option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={creationEnCours}
              className="h-10 px-5 rounded-md text-white text-sm font-medium self-start disabled:opacity-60"
              style={{ background: "var(--couleur-marque)" }}
            >
              {creationEnCours ? "Création…" : "Créer le compte"}
            </button>
          </form>
        </section>

        {/* Liste des employés */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Employés ({employes.length})
          </h2>
          <div className="flex flex-col">
            {employes.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 border-b"
                style={{ borderColor: "var(--couleur-bordure)", opacity: e.actif ? 1 : 0.5 }}
              >
                <div>
                  <p className="font-medium">{e.nom_complet}</p>
                  <p className="text-xs" style={{ color: "#8A8676" }}>
                    {e.identifiant && <>Identifiant : {e.identifiant} · </>}
                    {e.magasins?.nom} {!e.actif && "· désactivé"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={rolesModifies[e.id] ?? e.role}
                    onChange={(ev) => setRolesModifies((a) => ({ ...a, [e.id]: ev.target.value }))}
                    className="h-9 px-2 rounded-md border bg-white text-sm"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  >
                    {ORDRE_ROLES.map((r) => (
                      <option key={r} value={r}>{LIBELLES_ROLE[r]}</option>
                    ))}
                  </select>
                  {rolesModifies[e.id] && rolesModifies[e.id] !== e.role && (
                    <button
                      onClick={() => enregistrerRole(e.id)}
                      disabled={enregistrementEnCours === e.id}
                      className="h-9 px-3 rounded-md text-sm text-white disabled:opacity-60"
                      style={{ background: "var(--couleur-marque)" }}
                    >
                      Enregistrer
                    </button>
                  )}
                  <button
                    onClick={() => ouvrirReinitialisation(e.id)}
                    className="h-9 px-3 rounded-md text-sm border"
                    style={{
                      borderColor: mdpOuvertPour === e.id ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                      color: mdpOuvertPour === e.id ? "var(--couleur-marque)" : "var(--couleur-texte)",
                    }}
                  >
                    Mot de passe
                  </button>
                  <button
                    onClick={() => basculerActif(e.id, e.actif)}
                    className="h-9 px-3 rounded-md text-sm border"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  >
                    {e.actif ? "Désactiver" : "Réactiver"}
                  </button>
                  {e.id !== monPropreId && (
                    <button
                      onClick={() => supprimerEmploye(e.id, e.nom_complet)}
                      disabled={suppressionEnCours === e.id}
                      className="h-9 px-3 rounded-md text-sm disabled:opacity-60"
                      style={{ color: "var(--couleur-danger)" }}
                    >
                      {suppressionEnCours === e.id ? "Suppression…" : "Supprimer"}
                    </button>
                  )}
                </div>

                {mdpOuvertPour === e.id && (
                  <div
                    className="w-full flex flex-col gap-2 rounded-md p-3"
                    style={{ background: "#F0EEE7" }}
                  >
                    <p className="text-sm font-medium">Nouveau mot de passe pour {e.nom_complet}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        autoCapitalize="none"
                        spellCheck={false}
                        autoComplete="new-password"
                        value={nouveauMdp}
                        onChange={(ev) => setNouveauMdp(ev.target.value)}
                        placeholder="8 caractères minimum"
                        className="flex-1 min-w-[180px] h-9 px-3 rounded-md border bg-white text-sm font-mono"
                        style={{ borderColor: "var(--couleur-bordure)" }}
                      />
                      <button
                        type="button"
                        onClick={genererMotDePasse}
                        className="h-9 px-3 rounded-md text-sm border bg-white"
                        style={{ borderColor: "var(--couleur-bordure)" }}
                      >
                        Générer
                      </button>
                      <button
                        type="button"
                        onClick={() => reinitialiserMotDePasse(e)}
                        disabled={mdpEnCours || nouveauMdp.length < 8}
                        className="h-9 px-3 rounded-md text-sm text-white disabled:opacity-50"
                        style={{ background: "var(--couleur-marque)" }}
                      >
                        {mdpEnCours ? "Enregistrement…" : "Valider"}
                      </button>
                    </div>
                    <p className="text-xs" style={{ color: "#6B6858" }}>
                      L&apos;ancien mot de passe ne fonctionnera plus. Ce mot de passe est provisoire : l&apos;employé devra
                      en choisir un nouveau à sa prochaine connexion.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
