"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import { chargerProfilConnecte } from "@/lib/profil";
import {
  PRIX_VIDE,
  majSaisiePrix,
  resumePrix,
  validerSaisiePrix,
  type SaisiePrix,
} from "@/lib/prix";

const TRANCHE_AFFICHAGE = 50;

type Produit = {
  id: string;
  nom: string;
  code_barre: string | null;
  unite: "piece" | "kg" | "g" | "l" | "ml";
  prix_vente: number;
  prix_achat: number | null;
  marge_pct: number | null;
  seuil_reappro: number;
  actif: boolean;
};

type SaisieEntree = { quantite: string; lot: string; peremption: string };

const formateurFCFA = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const formateurMarge = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const champ =
  "h-10 px-3 rounded-md border bg-white text-sm outline-none focus:border-[var(--couleur-marque)]";
const bordure = { borderColor: "var(--couleur-bordure)" };

function messageErreur(message: string): string {
  if (/idx_produits_code_barre|duplicate key/i.test(message)) {
    return "Ce code-barres est déjà utilisé par un autre article.";
  }
  return message;
}

// Trois champs liés : prix d'achat, marge, prix de vente (calculé, modifiable).
function ChampsPrix({ saisie, onChange }: { saisie: SaisiePrix; onChange: (s: SaisiePrix) => void }) {
  const resume = resumePrix(saisie);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prix d&apos;achat (F)</span>
          <input
            required
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={saisie.achat}
            onChange={(e) => onChange(majSaisiePrix(saisie, "achat", e.target.value))}
            className={champ}
            style={bordure}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Marge (%)</span>
          <input
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="ex : 25"
            value={saisie.marge}
            onChange={(e) => onChange(majSaisiePrix(saisie, "marge", e.target.value))}
            className={champ}
            style={bordure}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prix de vente (F)</span>
          <input
            required
            type="number"
            min={1}
            step="1"
            inputMode="numeric"
            value={saisie.vente}
            onChange={(e) => onChange(majSaisiePrix(saisie, "vente", e.target.value))}
            className={`${champ} font-semibold`}
            style={bordure}
          />
        </label>
      </div>
      {resume && (
        <p
          className="text-xs"
          style={{ color: resume.aPerte ? "var(--couleur-danger)" : "var(--couleur-succes)" }}
        >
          {resume.aPerte
            ? `Attention : vente à perte de ${formateurFCFA.format(-resume.benefice)} F par unité.`
            : `Bénéfice : ${formateurFCFA.format(resume.benefice)} F par unité.`}
        </p>
      )}
    </div>
  );
}

export default function PageProduits() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [magasinId, setMagasinId] = useState<string | null>(null);
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");
  // Affichage par tranches : des milliers d'articles affichés d'un coup figent l'écran.
  const [nbAffiches, setNbAffiches] = useState(TRANCHE_AFFICHAGE);

  // Nouvel article
  const [nomNouveau, setNomNouveau] = useState("");
  const [codeBarreNouveau, setCodeBarreNouveau] = useState("");
  const [prixNouveau, setPrixNouveau] = useState<SaisiePrix>(PRIX_VIDE);
  const [seuilNouveau, setSeuilNouveau] = useState("10");
  const [stockInitial, setStockInitial] = useState("");
  const [creationEnCours, setCreationEnCours] = useState(false);

  // Entrée de stock : un seul panneau ouvert à la fois
  const [entreeOuvertePour, setEntreeOuvertePour] = useState<string | null>(null);
  const [prixEntree, setPrixEntree] = useState<SaisiePrix>(PRIX_VIDE);
  const [saisieEntree, setSaisieEntree] = useState<SaisieEntree>({ quantite: "", lot: "", peremption: "" });
  const [entreeEnCours, setEntreeEnCours] = useState(false);

  async function chargerDonnees() {
    const profil = await chargerProfilConnecte(supabase);

    if (!profil) return;
    setOrganisationId(profil.organisation_id);
    setMagasinId(profil.magasin_id);

    const [{ data: dataProduits }, { data: dataStocks }] = await Promise.all([
      supabase
        .from("produits")
        .select("id, nom, code_barre, unite, prix_vente, prix_achat, marge_pct, seuil_reappro, actif")
        .eq("actif", true)
        .order("nom"),
      supabase.from("stocks").select("produit_id, quantite").eq("magasin_id", profil.magasin_id),
    ]);

    setProduits(dataProduits ?? []);
    setStocks(Object.fromEntries((dataStocks ?? []).map((s) => [s.produit_id, Number(s.quantite)])));
    setChargement(false);
  }

  useEffect(() => {
    chargerDonnees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function afficherSucces(texte: string) {
    setErreur(null);
    setMessage(texte);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function afficherErreur(texte: string) {
    setMessage(null);
    setErreur(texte);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function creerProduit(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId || !magasinId) return;

    const verif = validerSaisiePrix(prixNouveau);
    if ("erreur" in verif) {
      afficherErreur(verif.erreur);
      return;
    }
    const quantiteInitiale = Number(stockInitial || 0);

    setCreationEnCours(true);
    const { data: cree, error } = await supabase
      .from("produits")
      .insert({
        organisation_id: organisationId,
        nom: nomNouveau.trim(),
        code_barre: codeBarreNouveau.trim() || null,
        prix_achat: verif.prix.achat,
        marge_pct: verif.prix.marge,
        prix_vente: verif.prix.vente,
        seuil_reappro: Number(seuilNouveau || 0),
      })
      .select("id")
      .single();

    if (error || !cree) {
      setCreationEnCours(false);
      afficherErreur(messageErreur(error?.message ?? "Impossible de créer l'article."));
      return;
    }

    // Stock de départ optionnel, enregistré comme une entrée de stock normale
    if (quantiteInitiale > 0) {
      const { error: erreurStock } = await supabase.rpc("entree_stock", {
        p_produit_id: cree.id,
        p_magasin_id: magasinId,
        p_quantite: quantiteInitiale,
        p_prix_achat: verif.prix.achat,
        p_marge_pct: verif.prix.marge,
        p_prix_vente: verif.prix.vente,
        p_reference: "stock initial",
      });
      if (erreurStock) {
        setCreationEnCours(false);
        afficherErreur(`Article créé, mais le stock initial n'a pas été enregistré : ${erreurStock.message}`);
        chargerDonnees();
        return;
      }
    }

    setCreationEnCours(false);
    afficherSucces(
      `Article « ${nomNouveau.trim()} » créé, vendu ${formateurFCFA.format(verif.prix.vente)} F` +
        (quantiteInitiale > 0 ? `, avec ${quantiteInitiale} en stock.` : ".")
    );
    setNomNouveau("");
    setCodeBarreNouveau("");
    setPrixNouveau(PRIX_VIDE);
    setSeuilNouveau("10");
    setStockInitial("");
    chargerDonnees();
  }

  function ouvrirEntree(p: Produit) {
    setErreur(null);
    setMessage(null);
    if (entreeOuvertePour === p.id) {
      setEntreeOuvertePour(null);
      return;
    }
    // Pré-rempli avec les derniers prix connus du produit
    setPrixEntree({
      achat: p.prix_achat !== null ? String(Number(p.prix_achat)) : "",
      marge: p.marge_pct !== null ? String(Number(p.marge_pct)) : "",
      vente: String(Number(p.prix_vente)),
    });
    setSaisieEntree({ quantite: "", lot: "", peremption: "" });
    setEntreeOuvertePour(p.id);
  }

  async function validerEntree(p: Produit) {
    if (!magasinId) return;
    const quantite = Number(saisieEntree.quantite);
    if (!quantite || quantite <= 0) {
      afficherErreur("Indiquez la quantité reçue.");
      return;
    }
    const verif = validerSaisiePrix(prixEntree);
    if ("erreur" in verif) {
      afficherErreur(verif.erreur);
      return;
    }

    setEntreeEnCours(true);
    const { error } = await supabase.rpc("entree_stock", {
      p_produit_id: p.id,
      p_magasin_id: magasinId,
      p_quantite: quantite,
      p_prix_achat: verif.prix.achat,
      p_marge_pct: verif.prix.marge,
      p_prix_vente: verif.prix.vente,
      p_numero_lot: saisieEntree.lot.trim() || null,
      p_date_peremption: saisieEntree.peremption || null,
      p_reference: "entrée de stock",
    });
    setEntreeEnCours(false);

    if (error) {
      afficherErreur(error.message);
      return;
    }

    const ancienPrix = Number(p.prix_vente);
    afficherSucces(
      `${quantite} × ${p.nom} ajouté(s) au stock.` +
        (verif.prix.vente !== ancienPrix
          ? ` Nouveau prix de vente : ${formateurFCFA.format(verif.prix.vente)} F (avant : ${formateurFCFA.format(ancienPrix)} F).`
          : "")
    );
    setEntreeOuvertePour(null);
    chargerDonnees();
  }

  const produitsFiltres = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    if (!t) return produits;
    return produits.filter((p) => p.nom.toLowerCase().includes(t) || p.code_barre === filtre.trim());
  }, [produits, filtre]);

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
        <p className="police-titre font-semibold text-lg">Produits et stock</p>
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

        {/* Nouvel article */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Ajouter un article
          </h2>
          <form onSubmit={creerProduit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Nom</span>
                <input required value={nomNouveau} onChange={(e) => setNomNouveau(e.target.value)} className={champ} style={bordure} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Code-barres (optionnel)</span>
                <input
                  value={codeBarreNouveau}
                  onChange={(e) => setCodeBarreNouveau(e.target.value)}
                  placeholder="Scannez ou tapez"
                  className={champ}
                  style={bordure}
                />
              </label>
            </div>

            <ChampsPrix saisie={prixNouveau} onChange={setPrixNouveau} />

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 w-40">
                <span className="text-sm font-medium">Stock initial (optionnel)</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={stockInitial}
                  onChange={(e) => setStockInitial(e.target.value)}
                  className={champ}
                  style={bordure}
                />
              </label>
              <label className="flex flex-col gap-1.5 w-32">
                <span className="text-sm font-medium">Seuil réappro</span>
                <input
                  type="number"
                  min={0}
                  value={seuilNouveau}
                  onChange={(e) => setSeuilNouveau(e.target.value)}
                  className={champ}
                  style={bordure}
                />
              </label>
              <button
                type="submit"
                disabled={creationEnCours}
                className="h-10 px-5 rounded-md text-white text-sm font-medium disabled:opacity-60"
                style={{ background: "var(--couleur-marque)" }}
              >
                {creationEnCours ? "Création…" : "Ajouter l'article"}
              </button>
            </div>
          </form>
        </section>

        {/* Liste des articles */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="police-titre font-semibold text-sm uppercase tracking-wide" style={{ color: "#6B6858" }}>
              Articles ({produits.length})
            </h2>
            <input
              value={filtre}
              onChange={(e) => {
                setFiltre(e.target.value);
                setNbAffiches(TRANCHE_AFFICHAGE);
              }}
              placeholder="Rechercher un article…"
              className="h-9 px-3 rounded-md border bg-white text-sm w-full sm:w-64"
              style={bordure}
            />
          </div>

          {produitsFiltres.length === 0 && (
            <p className="text-sm" style={{ color: "#8A8676" }}>
              {produits.length === 0 ? "Aucun article pour l'instant. Ajoutez le premier ci-dessus." : "Aucun article ne correspond."}
            </p>
          )}

          <div className="flex flex-col">
            {produitsFiltres.slice(0, nbAffiches).map((p) => {
              const stockActuel = stocks[p.id] ?? 0;
              const stockBas = stockActuel <= Number(p.seuil_reappro);
              const ouvert = entreeOuvertePour === p.id;
              return (
                <div key={p.id} className="py-3 border-b flex flex-col gap-3" style={bordure}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {p.nom}
                        {p.code_barre && (
                          <span className="text-xs font-normal ml-2" style={{ color: "#8A8676" }}>
                            {p.code_barre}
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: "#8A8676" }}>
                        {p.prix_achat !== null && <>Achat {formateurFCFA.format(Number(p.prix_achat))} F · </>}
                        {p.marge_pct !== null && <>Marge {formateurMarge.format(Number(p.marge_pct))} % · </>}
                        <span className="font-medium" style={{ color: "var(--couleur-texte)" }}>
                          Vente {formateurFCFA.format(Number(p.prix_vente))} F
                        </span>
                        {" · "}
                        <span style={{ color: stockBas ? "var(--couleur-accent-sombre)" : "#8A8676" }}>
                          {stockActuel} en stock
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => ouvrirEntree(p)}
                      className="shrink-0 h-9 px-3 rounded-md text-sm font-medium border"
                      style={{
                        borderColor: "var(--couleur-marque)",
                        background: ouvert ? "var(--couleur-marque)" : "transparent",
                        color: ouvert ? "white" : "var(--couleur-marque)",
                      }}
                    >
                      Entrée de stock
                    </button>
                  </div>

                  {ouvert && (
                    <div className="rounded-md p-4 flex flex-col gap-4" style={{ background: "#F0EEE7" }}>
                      <p className="text-sm font-medium">Entrée de stock : {p.nom}</p>
                      <label className="flex flex-col gap-1.5 w-40">
                        <span className="text-sm font-medium">Quantité reçue</span>
                        <input
                          autoFocus
                          required
                          type="number"
                          min={0}
                          step="any"
                          value={saisieEntree.quantite}
                          onChange={(e) => setSaisieEntree((s) => ({ ...s, quantite: e.target.value }))}
                          className={champ}
                          style={bordure}
                        />
                      </label>

                      <ChampsPrix saisie={prixEntree} onChange={setPrixEntree} />

                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex flex-col gap-1.5 w-40">
                          <span className="text-sm font-medium">N° de lot (optionnel)</span>
                          <input
                            value={saisieEntree.lot}
                            onChange={(e) => setSaisieEntree((s) => ({ ...s, lot: e.target.value }))}
                            className={champ}
                            style={bordure}
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium">Péremption (optionnel)</span>
                          <input
                            type="date"
                            value={saisieEntree.peremption}
                            onChange={(e) => setSaisieEntree((s) => ({ ...s, peremption: e.target.value }))}
                            className={champ}
                            style={bordure}
                          />
                        </label>
                        <button
                          onClick={() => validerEntree(p)}
                          disabled={entreeEnCours}
                          className="h-10 px-5 rounded-md text-white text-sm font-medium disabled:opacity-60"
                          style={{ background: "var(--couleur-marque)" }}
                        >
                          {entreeEnCours ? "Enregistrement…" : "Valider l'entrée"}
                        </button>
                        <button
                          onClick={() => setEntreeOuvertePour(null)}
                          className="h-10 px-3 text-sm"
                          style={{ color: "#6B6858" }}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {produitsFiltres.length > nbAffiches && (
            <button
              type="button"
              onClick={() => setNbAffiches((n) => n + TRANCHE_AFFICHAGE)}
              className="mt-4 h-10 px-4 rounded-md border text-sm font-medium bg-white"
              style={{ ...bordure, color: "var(--couleur-marque)" }}
            >
              Afficher {Math.min(TRANCHE_AFFICHAGE, produitsFiltres.length - nbAffiches)} articles de plus
              (encore {produitsFiltres.length - nbAffiches})
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
