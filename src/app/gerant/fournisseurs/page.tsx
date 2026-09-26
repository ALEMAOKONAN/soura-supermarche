"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import { chargerProfilConnecte } from "@/lib/profil";

type Fournisseur = { id: string; nom: string; telephone: string | null };
type Produit = { id: string; nom: string };
type LigneCommande = {
  id: string;
  produit_id: string;
  quantite_commandee: number;
  prix_unitaire: number;
  quantite_recue: number;
  produits: { nom: string } | null;
};
type Commande = {
  id: string;
  statut: string;
  cree_le: string;
  fournisseurs: { nom: string } | null;
  lignes_commande_fournisseur: LigneCommande[];
};

type LigneBrouillon = { produit_id: string; quantite: string; prix_unitaire: string };

const formateurFCFA = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const LIBELLES_STATUT: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  receptionnee_partielle: "Reçue partiellement",
  receptionnee: "Reçue",
  annulee: "Annulée",
};

export default function PageFournisseurs() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [magasinId, setMagasinId] = useState<string | null>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Nouveau fournisseur
  const [nomFournisseur, setNomFournisseur] = useState("");
  const [telFournisseur, setTelFournisseur] = useState("");

  // Nouvelle commande
  const [fournisseurChoisi, setFournisseurChoisi] = useState("");
  const [lignesBrouillon, setLignesBrouillon] = useState<LigneBrouillon[]>([
    { produit_id: "", quantite: "", prix_unitaire: "" },
  ]);
  const [creationCommandeEnCours, setCreationCommandeEnCours] = useState(false);

  // Réception en cours (par ligne)
  const [receptions, setReceptions] = useState<Record<string, { quantite: string; lot: string; peremption: string }>>({});

  async function chargerDonnees() {
    const profil = await chargerProfilConnecte(supabase);
    if (!profil) return;

    setOrganisationId(profil.organisation_id);
    setMagasinId(profil.magasin_id);

    const [{ data: dataFournisseurs }, { data: dataProduits }, { data: dataCommandes }] = await Promise.all([
      supabase.from("fournisseurs").select("id, nom, telephone").eq("actif", true).order("nom"),
      supabase.from("produits").select("id, nom").eq("actif", true).order("nom"),
      supabase
        .from("commandes_fournisseurs")
        .select("id, statut, cree_le, fournisseurs(nom), lignes_commande_fournisseur(id, produit_id, quantite_commandee, prix_unitaire, quantite_recue, produits(nom))")
        .eq("magasin_id", profil.magasin_id)
        .order("cree_le", { ascending: false }),
    ]);

    setFournisseurs(dataFournisseurs ?? []);
    setProduits(dataProduits ?? []);
    setCommandes((dataCommandes as unknown as Commande[]) ?? []);
    setChargement(false);
  }

  useEffect(() => {
    chargerDonnees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function creerFournisseur(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId) return;
    setErreur(null);

    const { error } = await supabase.from("fournisseurs").insert({
      organisation_id: organisationId,
      nom: nomFournisseur,
      telephone: telFournisseur || null,
    });

    if (error) {
      setErreur(error.message);
      return;
    }
    setNomFournisseur("");
    setTelFournisseur("");
    setMessage("Fournisseur ajouté.");
    chargerDonnees();
  }

  function mettreAJourLigneBrouillon(index: number, champ: keyof LigneBrouillon, valeur: string) {
    setLignesBrouillon((actuel) =>
      actuel.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l))
    );
  }

  async function creerCommande(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId || !magasinId || !fournisseurChoisi) return;

    const lignesValides = lignesBrouillon.filter((l) => l.produit_id && l.quantite && l.prix_unitaire);
    if (lignesValides.length === 0) {
      setErreur("Ajoutez au moins un article à la commande.");
      return;
    }

    setErreur(null);
    setCreationCommandeEnCours(true);

    const { data: commande, error: erreurCommande } = await supabase
      .from("commandes_fournisseurs")
      .insert({ organisation_id: organisationId, magasin_id: magasinId, fournisseur_id: fournisseurChoisi })
      .select("id")
      .single();

    if (erreurCommande || !commande) {
      setErreur(erreurCommande?.message ?? "Impossible de créer la commande.");
      setCreationCommandeEnCours(false);
      return;
    }

    const { error: erreurLignes } = await supabase.from("lignes_commande_fournisseur").insert(
      lignesValides.map((l) => ({
        commande_id: commande.id,
        produit_id: l.produit_id,
        quantite_commandee: Number(l.quantite),
        prix_unitaire: Number(l.prix_unitaire),
      }))
    );

    setCreationCommandeEnCours(false);

    if (erreurLignes) {
      setErreur(erreurLignes.message);
      return;
    }

    setFournisseurChoisi("");
    setLignesBrouillon([{ produit_id: "", quantite: "", prix_unitaire: "" }]);
    setMessage("Commande créée.");
    chargerDonnees();
  }

  async function receptionnerLigne(ligneId: string) {
    const saisie = receptions[ligneId];
    if (!saisie?.quantite) return;

    setErreur(null);

    const { error } = await supabase.rpc("receptionner_ligne_commande", {
      p_ligne_id: ligneId,
      p_quantite: Number(saisie.quantite),
      p_numero_lot: saisie.lot || null,
      p_date_peremption: saisie.peremption || null,
    });

    if (error) {
      setErreur(error.message);
      return;
    }

    setReceptions((actuel) => ({ ...actuel, [ligneId]: { quantite: "", lot: "", peremption: "" } }));
    setMessage("Réception enregistrée, stock mis à jour.");
    chargerDonnees();
  }

  if (chargement) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--couleur-fond)" }}>
        <p style={{ color: "#8A8676" }}>Chargement…</p>
      </main>
    );
  }

  return (
    <main>
      <header
        className="flex items-center h-16 px-8 border-b"
        style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
      >
        <p className="police-titre font-semibold text-lg">Fournisseurs</p>
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

        {/* Fournisseurs */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Fournisseurs ({fournisseurs.length})
          </h2>
          <ul className="flex flex-col mb-4">
            {fournisseurs.map((f) => (
              <li key={f.id} className="py-2 border-b text-sm flex justify-between" style={{ borderColor: "var(--couleur-bordure)" }}>
                <span>{f.nom}</span>
                <span style={{ color: "#8A8676" }}>{f.telephone}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={creerFournisseur} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
              <span className="text-sm font-medium">Nom</span>
              <input
                required
                value={nomFournisseur}
                onChange={(e) => setNomFournisseur(e.target.value)}
                className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>
            <label className="flex flex-col gap-1.5 w-40">
              <span className="text-sm font-medium">Téléphone</span>
              <input
                value={telFournisseur}
                onChange={(e) => setTelFournisseur(e.target.value)}
                className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>
            <button
              type="submit"
              className="h-10 px-5 rounded-md text-white text-sm font-medium"
              style={{ background: "var(--couleur-marque)" }}
            >
              Ajouter
            </button>
          </form>
        </section>

        {/* Nouvelle commande */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Nouvelle commande
          </h2>
          <form onSubmit={creerCommande} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 max-w-xs">
              <span className="text-sm font-medium">Fournisseur</span>
              <select
                required
                value={fournisseurChoisi}
                onChange={(e) => setFournisseurChoisi(e.target.value)}
                className="h-10 px-3 rounded-md border bg-white text-sm"
                style={{ borderColor: "var(--couleur-bordure)" }}
              >
                <option value="">Choisir…</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>{f.nom}</option>
                ))}
              </select>
            </label>

            {lignesBrouillon.map((ligne, index) => (
              <div key={index} className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
                  <span className="text-sm font-medium">Article</span>
                  <select
                    value={ligne.produit_id}
                    onChange={(e) => mettreAJourLigneBrouillon(index, "produit_id", e.target.value)}
                    className="h-10 px-3 rounded-md border bg-white text-sm"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  >
                    <option value="">Choisir…</option>
                    {produits.map((p) => (
                      <option key={p.id} value={p.id}>{p.nom}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 w-28">
                  <span className="text-sm font-medium">Quantité</span>
                  <input
                    type="number"
                    min={0}
                    value={ligne.quantite}
                    onChange={(e) => mettreAJourLigneBrouillon(index, "quantite", e.target.value)}
                    className="h-10 px-3 rounded-md border bg-white text-sm"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  />
                </label>
                <label className="flex flex-col gap-1.5 w-32">
                  <span className="text-sm font-medium">Prix unitaire</span>
                  <input
                    type="number"
                    min={0}
                    value={ligne.prix_unitaire}
                    onChange={(e) => mettreAJourLigneBrouillon(index, "prix_unitaire", e.target.value)}
                    className="h-10 px-3 rounded-md border bg-white text-sm"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  />
                </label>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setLignesBrouillon((a) => [...a, { produit_id: "", quantite: "", prix_unitaire: "" }])}
              className="text-sm self-start"
              style={{ color: "var(--couleur-marque)" }}
            >
              + Ajouter un article
            </button>

            <button
              type="submit"
              disabled={creationCommandeEnCours}
              className="h-10 px-5 rounded-md text-white text-sm font-medium self-start disabled:opacity-60"
              style={{ background: "var(--couleur-accent)" }}
            >
              {creationCommandeEnCours ? "Création…" : "Créer la commande"}
            </button>
          </form>
        </section>

        {/* Commandes en cours */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Commandes
          </h2>
          <div className="flex flex-col gap-5">
            {commandes.map((c) => (
              <div key={c.id} className="rounded-md border p-4" style={{ borderColor: "var(--couleur-bordure)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-medium">{c.fournisseurs?.nom}</p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: c.statut === "receptionnee" ? "#E9F5EE" : "#FFF4EC",
                      color: c.statut === "receptionnee" ? "var(--couleur-succes)" : "var(--couleur-accent-sombre)",
                    }}
                  >
                    {LIBELLES_STATUT[c.statut] ?? c.statut}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {c.lignes_commande_fournisseur.map((l) => {
                    const resteALivrer = l.quantite_commandee - l.quantite_recue;
                    return (
                      <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1">
                        <span>
                          {l.produits?.nom} — {l.quantite_recue}/{l.quantite_commandee} reçus
                        </span>
                        {resteALivrer > 0 && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={resteALivrer}
                              placeholder="Qté"
                              value={receptions[l.id]?.quantite ?? ""}
                              onChange={(e) =>
                                setReceptions((a) => ({ ...a, [l.id]: { ...a[l.id], quantite: e.target.value, lot: a[l.id]?.lot ?? "", peremption: a[l.id]?.peremption ?? "" } }))
                              }
                              className="w-16 h-8 px-2 rounded-md border text-sm"
                              style={{ borderColor: "var(--couleur-bordure)" }}
                            />
                            <input
                              type="text"
                              placeholder="N° lot"
                              value={receptions[l.id]?.lot ?? ""}
                              onChange={(e) =>
                                setReceptions((a) => ({ ...a, [l.id]: { ...a[l.id], lot: e.target.value, quantite: a[l.id]?.quantite ?? "", peremption: a[l.id]?.peremption ?? "" } }))
                              }
                              className="w-24 h-8 px-2 rounded-md border text-sm"
                              style={{ borderColor: "var(--couleur-bordure)" }}
                            />
                            <input
                              type="date"
                              value={receptions[l.id]?.peremption ?? ""}
                              onChange={(e) =>
                                setReceptions((a) => ({ ...a, [l.id]: { ...a[l.id], peremption: e.target.value, quantite: a[l.id]?.quantite ?? "", lot: a[l.id]?.lot ?? "" } }))
                              }
                              className="h-8 px-2 rounded-md border text-sm"
                              style={{ borderColor: "var(--couleur-bordure)" }}
                            />
                            <button
                              onClick={() => receptionnerLigne(l.id)}
                              className="h-8 px-3 rounded-md text-xs font-medium border"
                              style={{ borderColor: "var(--couleur-marque)", color: "var(--couleur-marque)" }}
                            >
                              Réceptionner
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
