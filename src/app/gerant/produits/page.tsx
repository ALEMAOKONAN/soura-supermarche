"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";

type Produit = {
  id: string;
  nom: string;
  code_barre: string | null;
  unite: "piece" | "kg" | "g" | "l" | "ml";
  prix_vente: number;
  prix_achat: number | null;
  seuil_reappro: number;
  actif: boolean;
};

const formateurFCFA = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export default function PageProduits() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [magasinId, setMagasinId] = useState<string | null>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Formulaire nouvel article
  const [nomNouveau, setNomNouveau] = useState("");
  const [prixNouveau, setPrixNouveau] = useState("");
  const [seuilNouveau, setSeuilNouveau] = useState("10");
  const [creationEnCours, setCreationEnCours] = useState(false);

  // Ajout de stock par produit (quantité saisie par ligne)
  const [quantitesAjout, setQuantitesAjout] = useState<Record<string, string>>({});
  const [ajoutEnCours, setAjoutEnCours] = useState<string | null>(null);

  async function chargerDonnees() {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("organisation_id, magasin_id")
      .eq("id", authData.user.id)
      .single();

    if (!profil) return;
    setOrganisationId(profil.organisation_id);
    setMagasinId(profil.magasin_id);

    const { data: dataProduits } = await supabase
      .from("produits")
      .select("id, nom, code_barre, unite, prix_vente, prix_achat, seuil_reappro, actif")
      .eq("actif", true)
      .order("nom");

    const { data: dataStocks } = await supabase
      .from("stocks")
      .select("produit_id, quantite")
      .eq("magasin_id", profil.magasin_id);

    setProduits(dataProduits ?? []);
    setStocks(Object.fromEntries((dataStocks ?? []).map((s) => [s.produit_id, s.quantite])));
    setChargement(false);
  }

  useEffect(() => {
    chargerDonnees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function creerProduit(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId) return;
    setErreur(null);
    setCreationEnCours(true);

    const { error } = await supabase.from("produits").insert({
      organisation_id: organisationId,
      nom: nomNouveau,
      prix_vente: Number(prixNouveau),
      seuil_reappro: Number(seuilNouveau),
    });

    setCreationEnCours(false);

    if (error) {
      setErreur(error.message);
      return;
    }

    setNomNouveau("");
    setPrixNouveau("");
    setSeuilNouveau("10");
    setMessage("Article créé.");
    chargerDonnees();
  }

  async function ajouterStock(produitId: string) {
    if (!magasinId) return;
    const quantite = Number(quantitesAjout[produitId]);
    if (!quantite || quantite <= 0) return;

    setErreur(null);
    setAjoutEnCours(produitId);

    const { error } = await supabase.rpc("ajouter_stock_manuel", {
      p_produit_id: produitId,
      p_magasin_id: magasinId,
      p_quantite: quantite,
      p_reference: "ajout manuel — écran gestion",
    });

    setAjoutEnCours(null);

    if (error) {
      setErreur(error.message);
      return;
    }

    setQuantitesAjout((actuel) => ({ ...actuel, [produitId]: "" }));
    setMessage(`Stock mis à jour pour ${produits.find((p) => p.id === produitId)?.nom}.`);
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
        <p className="police-titre font-semibold text-lg">Produits</p>
      </header>

      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-8">
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

        {/* Nouvel article */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Ajouter un article
          </h2>
          <form onSubmit={creerProduit} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
              <span className="text-sm font-medium">Nom</span>
              <input
                required
                value={nomNouveau}
                onChange={(e) => setNomNouveau(e.target.value)}
                className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>
            <label className="flex flex-col gap-1.5 w-32">
              <span className="text-sm font-medium">Prix de vente</span>
              <input
                required
                type="number"
                min={0}
                value={prixNouveau}
                onChange={(e) => setPrixNouveau(e.target.value)}
                className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>
            <label className="flex flex-col gap-1.5 w-28">
              <span className="text-sm font-medium">Seuil réappro</span>
              <input
                type="number"
                min={0}
                value={seuilNouveau}
                onChange={(e) => setSeuilNouveau(e.target.value)}
                className="h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]"
                style={{ borderColor: "var(--couleur-bordure)" }}
              />
            </label>
            <button
              type="submit"
              disabled={creationEnCours}
              className="h-10 px-5 rounded-md text-white text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--couleur-marque)" }}
            >
              {creationEnCours ? "Création…" : "Ajouter"}
            </button>
          </form>
        </section>

        {/* Liste des articles */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Articles ({produits.length})
          </h2>
          <div className="flex flex-col">
            {produits.map((p) => {
              const stockActuel = stocks[p.id] ?? 0;
              const stockBas = stockActuel <= p.seuil_reappro;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-4 py-3 border-b"
                  style={{ borderColor: "var(--couleur-bordure)" }}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.nom}</p>
                    <p className="text-xs" style={{ color: "#8A8676" }}>
                      {formateurFCFA.format(p.prix_vente)} F ·{" "}
                      <span style={{ color: stockBas ? "var(--couleur-accent-sombre)" : "#8A8676" }}>
                        {stockActuel} en stock
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={0}
                      placeholder="Qté"
                      value={quantitesAjout[p.id] ?? ""}
                      onChange={(e) =>
                        setQuantitesAjout((actuel) => ({ ...actuel, [p.id]: e.target.value }))
                      }
                      className="w-20 h-9 px-2 rounded-md border text-sm text-right"
                      style={{ borderColor: "var(--couleur-bordure)" }}
                    />
                    <button
                      onClick={() => ajouterStock(p.id)}
                      disabled={ajoutEnCours === p.id}
                      className="h-9 px-3 rounded-md text-sm font-medium border disabled:opacity-60"
                      style={{ borderColor: "var(--couleur-marque)", color: "var(--couleur-marque)" }}
                    >
                      + Stock
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
