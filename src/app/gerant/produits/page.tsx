"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import { chargerProfilConnecte } from "@/lib/profil";
import EnTetePage from "@/components/EnTetePage";
import Icone from "@/components/Icone";
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

const champ = "champ";
const bordure = {};

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Prix d&apos;achat (F)</span>
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
          <span className="text-sm font-semibold">Marge (%)</span>
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
          <span className="text-sm font-semibold">Prix de vente (F)</span>
          <input
            required
            type="number"
            min={1}
            step="1"
            inputMode="numeric"
            value={saisie.vente}
            onChange={(e) => onChange(majSaisiePrix(saisie, "vente", e.target.value))}
            className={`${champ} font-bold text-[17px]`}
            style={bordure}
          />
        </label>
      </div>
      {resume && (
        <p
          className="text-sm font-semibold rounded-[10px] px-3.5 py-2.5 mt-1"
          style={{
            color: resume.aPerte ? "#9B1C14" : "var(--couleur-marque-claire)",
            background: resume.aPerte ? "#FDE3E1" : "var(--couleur-menthe)",
          }}
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
  const [filtreStock, setFiltreStock] = useState<"tous" | "bas" | "rupture">("tous");
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);

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

  const etatStock = useCallback(
    (p: Produit): "ok" | "bas" | "rupture" => {
      const q = stocks[p.id] ?? 0;
      if (q <= 0) return "rupture";
      return q <= Number(p.seuil_reappro) ? "bas" : "ok";
    },
    [stocks]
  );

  const produitsFiltres = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    return produits.filter(
      (p) =>
        (!t || p.nom.toLowerCase().includes(t) || p.code_barre === filtre.trim()) &&
        (filtreStock === "tous" || etatStock(p) === filtreStock)
    );
  }, [produits, filtre, filtreStock, etatStock]);

  const nbBas = useMemo(() => produits.filter((p) => etatStock(p) === "bas").length, [produits, etatStock]);
  const nbRupture = useMemo(() => produits.filter((p) => etatStock(p) === "rupture").length, [produits, etatStock]);

  if (chargement) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--couleur-fond)" }}>
        <p style={{ color: "var(--couleur-texte-3)" }}>Chargement…</p>
      </main>
    );
  }

  const afficherFormulaire = formulaireOuvert || produits.length === 0;
  const FILTRES: { valeur: typeof filtreStock; libelle: string }[] = [
    { valeur: "tous", libelle: "Tous" },
    { valeur: "bas", libelle: `Stock bas (${nbBas})` },
    { valeur: "rupture", libelle: `Rupture (${nbRupture})` },
  ];

  return (
    <main className="pb-10">
      <EnTetePage
        surtitre={`${produits.length} article${produits.length > 1 ? "s" : ""} actif${produits.length > 1 ? "s" : ""}`}
        titre="Produits et stock"
        actions={
          produits.length > 0 && (
            <button
              type="button"
              onClick={() => setFormulaireOuvert((v) => !v)}
              aria-expanded={afficherFormulaire}
              className={`bouton ${afficherFormulaire ? "bouton-secondaire" : "bouton-principal"}`}
            >
              <Icone nom={afficherFormulaire ? "fermer" : "plus"} taille={18} />
              {afficherFormulaire ? "Fermer" : "Nouvel article"}
            </button>
          )
        }
      />

      <div className="px-5 md:px-8 pt-5 max-w-6xl flex flex-col gap-5">
        {erreur && (
          <p role="alert" className="text-sm rounded-[10px] px-3.5 py-2.5" style={{ background: "#FDE3E1", color: "var(--couleur-danger)" }}>
            {erreur}
          </p>
        )}
        {message && !erreur && (
          <p role="status" className="text-sm rounded-[10px] px-3.5 py-2.5" style={{ background: "#E3F3EA", color: "var(--couleur-succes)" }}>
            {message}
          </p>
        )}

        {/* Nouvel article */}
        {afficherFormulaire && (
          <section className="carte p-5 md:p-6">
            <h2 className="titre-section mb-4">Ajouter un article</h2>
            <form onSubmit={creerProduit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">Nom</span>
                  <input required value={nomNouveau} onChange={(e) => setNomNouveau(e.target.value)} className={champ} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">
                    Code-barres <span className="font-normal" style={{ color: "var(--couleur-texte-2)" }}>facultatif</span>
                  </span>
                  <input
                    value={codeBarreNouveau}
                    onChange={(e) => setCodeBarreNouveau(e.target.value)}
                    placeholder="Scannez ou tapez"
                    className={champ}
                  />
                </label>
              </div>

              <ChampsPrix saisie={prixNouveau} onChange={setPrixNouveau} />

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5 w-40">
                  <span className="text-sm font-semibold">
                    Stock initial <span className="font-normal" style={{ color: "var(--couleur-texte-2)" }}>facultatif</span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={stockInitial}
                    onChange={(e) => setStockInitial(e.target.value)}
                    className={champ}
                  />
                </label>
                <label className="flex flex-col gap-1.5 w-36">
                  <span className="text-sm font-semibold">Seuil réappro</span>
                  <input
                    type="number"
                    min={0}
                    value={seuilNouveau}
                    onChange={(e) => setSeuilNouveau(e.target.value)}
                    className={champ}
                  />
                </label>
                <button type="submit" disabled={creationEnCours} className="bouton bouton-accent h-[46px]">
                  {creationEnCours ? "Création…" : "Ajouter l'article"}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Recherche et filtres */}
        <div className="flex flex-wrap items-center gap-2.5">
          <label
            className="flex-1 basis-64 flex items-center gap-2.5 h-[46px] px-3.5 rounded-xl border bg-white focus-within:border-[var(--couleur-marque)]"
            style={{ borderColor: "var(--couleur-bordure)" }}
          >
            <span style={{ color: "var(--couleur-texte-2)" }}>
              <Icone nom="recherche" taille={18} />
            </span>
            <input
              value={filtre}
              aria-label="Rechercher un article"
              onChange={(e) => {
                setFiltre(e.target.value);
                setNbAffiches(TRANCHE_AFFICHAGE);
              }}
              placeholder="Rechercher un article…"
              className="champ-nu flex-1 min-w-0 bg-transparent outline-none text-[15px]"
            />
          </label>
          {FILTRES.map((f) => {
            const actif = filtreStock === f.valeur;
            return (
              <button
                key={f.valeur}
                type="button"
                aria-pressed={actif}
                onClick={() => {
                  setFiltreStock(f.valeur);
                  setNbAffiches(TRANCHE_AFFICHAGE);
                }}
                className="h-[46px] px-4 rounded-xl border text-[15px] font-semibold transition-colors"
                style={{
                  borderColor: actif ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                  background: actif ? "var(--couleur-marque)" : "#FFFFFF",
                  color: actif ? "#FFFFFF" : "var(--couleur-texte)",
                }}
              >
                {f.libelle}
              </button>
            );
          })}
        </div>

        {/* Liste des articles */}
        <section className="carte overflow-hidden" aria-label="Articles">
          {produitsFiltres.length === 0 && (
            <p className="px-5 py-8 text-[15px] text-center" style={{ color: "var(--couleur-texte-2)" }}>
              {produits.length === 0 ? "Aucun article pour l'instant. Ajoutez le premier ci-dessus." : "Aucun article ne correspond."}
            </p>
          )}

          {produitsFiltres.slice(0, nbAffiches).map((p) => {
            const stockActuel = stocks[p.id] ?? 0;
            const etat = etatStock(p);
            const ouvert = entreeOuvertePour === p.id;
            return (
              <div
                key={p.id}
                className="border-b last:border-b-0"
                style={{ borderColor: "var(--couleur-ligne)", background: ouvert ? "#F7FAF8" : undefined }}
              >
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5">
                  <div className="flex-1 basis-56 min-w-0">
                    <p className="text-[15px] font-semibold truncate">{p.nom}</p>
                    <p className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
                      {p.code_barre ?? "Sans code-barres"}
                    </p>
                  </div>
                  <div className="text-right w-24">
                    <p className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>Achat</p>
                    <p className="text-[15px]">
                      {p.prix_achat !== null ? `${formateurFCFA.format(Number(p.prix_achat))} F` : "—"}
                    </p>
                  </div>
                  <div className="text-right w-28">
                    <p className="text-[15px] font-bold">{formateurFCFA.format(Number(p.prix_vente))} F</p>
                    {p.marge_pct !== null && (
                      <p className="text-xs font-semibold" style={{ color: "var(--couleur-succes)" }}>
                        marge {formateurMarge.format(Number(p.marge_pct))} %
                      </p>
                    )}
                  </div>
                  <div className="w-28 flex justify-end">
                    <span className={`pastille pastille-${etat}`}>
                      {etat === "rupture" ? "Rupture" : `${formateurMarge.format(stockActuel)} en stock`}
                    </span>
                  </div>
                  <button
                    onClick={() => ouvrirEntree(p)}
                    aria-expanded={ouvert}
                    className={`bouton ${ouvert ? "bouton-principal" : "bouton-secondaire"} min-h-0 h-10 px-3.5 text-sm`}
                  >
                    Entrée de stock
                  </button>
                </div>

                {ouvert && (
                  <div className="mx-4 mb-4 rounded-2xl border-2 bg-white p-5 flex flex-col gap-4" style={{ borderColor: "var(--couleur-marque)" }}>
                    <div>
                      <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: "var(--couleur-accent)" }}>
                        Entrée de stock
                      </p>
                      <p className="police-titre text-xl font-bold">{p.nom}</p>
                      <p className="text-sm" style={{ color: "var(--couleur-texte-2)" }}>
                        Stock actuel : {formateurMarge.format(stockActuel)}
                      </p>
                    </div>
                    <label className="flex flex-col gap-1.5 w-44">
                      <span className="text-sm font-semibold">Quantité reçue</span>
                      <input
                        autoFocus
                        required
                        type="number"
                        min={0}
                        step="any"
                        value={saisieEntree.quantite}
                        onChange={(e) => setSaisieEntree((s) => ({ ...s, quantite: e.target.value }))}
                        className={`${champ} text-[17px]`}
                      />
                    </label>

                    <ChampsPrix saisie={prixEntree} onChange={setPrixEntree} />

                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1.5 w-44">
                        <span className="text-sm font-semibold">
                          N° de lot <span className="font-normal" style={{ color: "var(--couleur-texte-2)" }}>facultatif</span>
                        </span>
                        <input
                          value={saisieEntree.lot}
                          onChange={(e) => setSaisieEntree((s) => ({ ...s, lot: e.target.value }))}
                          className={champ}
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-semibold">
                          Péremption <span className="font-normal" style={{ color: "var(--couleur-texte-2)" }}>facultatif</span>
                        </span>
                        <input
                          type="date"
                          value={saisieEntree.peremption}
                          onChange={(e) => setSaisieEntree((s) => ({ ...s, peremption: e.target.value }))}
                          className={champ}
                        />
                      </label>
                      <button onClick={() => validerEntree(p)} disabled={entreeEnCours} className="bouton bouton-accent h-[46px]">
                        {entreeEnCours ? "Enregistrement…" : "Enregistrer l'entrée"}
                      </button>
                      <button
                        onClick={() => setEntreeOuvertePour(null)}
                        className="h-[46px] px-3 text-sm font-semibold"
                        style={{ color: "var(--couleur-texte-2)" }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {produitsFiltres.length > nbAffiches && (
          <button
            type="button"
            onClick={() => setNbAffiches((n) => n + TRANCHE_AFFICHAGE)}
            className="bouton bouton-secondaire self-center"
          >
            Afficher {Math.min(TRANCHE_AFFICHAGE, produitsFiltres.length - nbAffiches)} articles de plus
            (encore {produitsFiltres.length - nbAffiches})
          </button>
        )}
      </div>
    </main>
  );
}
