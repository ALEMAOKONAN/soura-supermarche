"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import { chargerProfilConnecte, type ProfilConnecte } from "@/lib/profil";
import EnTetePage from "@/components/EnTetePage";
import Icone from "@/components/Icone";
import {
  CATEGORIES_DEPENSE,
  MODES_DEPENSE,
  MODES_VENTE,
  OPERATEURS,
  aujourdhui,
  fabriquerExcel,
  formaterDate,
  libelleCategorie,
  libelleModeDepense,
  nomFichierExport,
  periodePredefinie,
  telecharger,
  toutRecuperer,
  type CategorieDepense,
  type LigneDepense,
  type LigneDetailVente,
  type LigneJournalVente,
  type ModeDepense,
  type Synthese,
} from "@/lib/compta";

const formateurFCFA = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const F = (n: number) => `${formateurFCFA.format(n)} F`;

type ChoixPeriode = "mois" | "mois_precedent" | "annee" | "perso";
const CHOIX_PERIODE: { valeur: ChoixPeriode; libelle: string }[] = [
  { valeur: "mois", libelle: "Ce mois-ci" },
  { valeur: "mois_precedent", libelle: "Mois dernier" },
  { valeur: "annee", libelle: "Cette année" },
  { valeur: "perso", libelle: "Autre période" },
];

type Magasin = { id: string; nom: string };

const SAISIE_VIDE = {
  date: aujourdhui(),
  categorie: "" as CategorieDepense | "",
  libelle: "",
  montant: "",
  mode: "especes" as ModeDepense,
  beneficiaire: "",
  piece: "",
  magasinId: "",
};

export default function PageComptabilite() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [profil, setProfil] = useState<ProfilConnecte | null>(null);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [magasinFiltre, setMagasinFiltre] = useState<string>("tous");
  const [choix, setChoix] = useState<ChoixPeriode>("mois");
  const [periode, setPeriode] = useState(periodePredefinie("mois"));

  const [synthese, setSynthese] = useState<Synthese | null>(null);
  const [depenses, setDepenses] = useState<LigneDepense[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [saisie, setSaisie] = useState(SAISIE_VIDE);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [export_, setExport] = useState<string | null>(null);

  const estAdmin = profil?.role === "admin_org";
  const magasinCible = estAdmin ? (magasinFiltre === "tous" ? null : magasinFiltre) : (profil?.magasin_id ?? null);
  const nomMagasin = magasinCible ? (magasins.find((m) => m.id === magasinCible)?.nom ?? "Mon magasin") : "Tous les magasins";

  // Profil et magasins (une fois)
  useEffect(() => {
    (async () => {
      const p = await chargerProfilConnecte(supabase);
      setProfil(p);
      const { data } = await supabase.from("magasins").select("id, nom").eq("actif", true).order("nom");
      setMagasins(data ?? []);
      if (p && p.role !== "admin_org" && p.magasin_id) setSaisie((s) => ({ ...s, magasinId: p.magasin_id ?? "" }));
    })();
  }, [supabase]);

  const charger = useCallback(async () => {
    if (!profil) return;
    if (periode.debut > periode.fin) {
      setErreur("La date de début doit être avant la date de fin.");
      return;
    }
    setChargement(true);
    setErreur(null);
    const [{ data: s, error: e1 }, resDepenses] = await Promise.all([
      supabase.rpc("synthese_comptable", { p_debut: periode.debut, p_fin: periode.fin, p_magasin_id: magasinCible }),
      (() => {
        let q = supabase
          .from("journal_depenses")
          .select("*")
          .gte("jour", periode.debut)
          .lte("jour", periode.fin)
          .order("jour", { ascending: false })
          .limit(200);
        if (magasinCible) q = q.eq("magasin_id", magasinCible);
        return q;
      })(),
    ]);
    if (e1 || resDepenses.error) {
      setErreur(
        "Impossible de charger la comptabilité. Vérifiez que le script « module_comptable.sql » a bien été lancé dans Supabase."
      );
    } else {
      setSynthese(s as Synthese);
      setDepenses((resDepenses.data as LigneDepense[]) ?? []);
    }
    setChargement(false);
  }, [supabase, profil, periode, magasinCible]);

  useEffect(() => {
    void charger();
  }, [charger]);

  function choisirPeriode(c: ChoixPeriode) {
    setChoix(c);
    if (c !== "perso") setPeriode(periodePredefinie(c));
  }

  async function enregistrerDepense(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    const montant = Number(saisie.montant.replace(",", "."));
    const magasinId = estAdmin ? saisie.magasinId || magasinCible : profil?.magasin_id;
    if (!magasinId) return setErreur("Choisissez le magasin concerné par la dépense.");
    if (!saisie.categorie) return setErreur("Choisissez une catégorie.");
    if (!saisie.libelle.trim()) return setErreur("Indiquez à quoi correspond la dépense.");
    if (!(montant > 0)) return setErreur("Indiquez un montant valide.");

    setEnregistrement(true);
    const { error } = await supabase.from("depenses").insert({
      organisation_id: profil?.organisation_id,
      magasin_id: magasinId,
      date_depense: saisie.date,
      categorie: saisie.categorie,
      libelle: saisie.libelle.trim(),
      montant,
      mode_paiement: saisie.mode,
      beneficiaire: saisie.beneficiaire.trim() || null,
      numero_piece: saisie.piece.trim() || null,
    });
    setEnregistrement(false);
    if (error) return setErreur(`Dépense non enregistrée : ${error.message}`);
    setMessage(`Dépense enregistrée : ${saisie.libelle.trim()} — ${F(montant)}.`);
    setSaisie((s) => ({ ...SAISIE_VIDE, date: s.date, magasinId: s.magasinId }));
    void charger();
  }

  async function supprimerDepense(d: LigneDepense) {
    if (!window.confirm(`Supprimer la dépense « ${d.libelle} » de ${F(Number(d.montant))} ?`)) return;
    const { error } = await supabase.from("depenses").delete().eq("id", d.depense_id);
    if (error) return setErreur(`Suppression impossible : ${error.message}`);
    setMessage("Dépense supprimée.");
    void charger();
  }

  async function exporter() {
    if (!synthese) return;
    setErreur(null);
    setMessage(null);
    try {
      setExport("Lecture des ventes…");
      const ventes = await toutRecuperer<LigneJournalVente>(
        (de, a) => {
          let q = supabase.from("journal_ventes").select("*").gte("jour", periode.debut).lte("jour", periode.fin);
          if (magasinCible) q = q.eq("magasin_id", magasinCible);
          return q.order("date_heure").order("vente_id").range(de, a);
        },
        (n) => setExport(`Lecture des ventes… ${formateurFCFA.format(n)}`)
      );
      const details = await toutRecuperer<LigneDetailVente>(
        (de, a) => {
          let q = supabase.from("journal_lignes_vente").select("*").gte("jour", periode.debut).lte("jour", periode.fin);
          if (magasinCible) q = q.eq("magasin_id", magasinCible);
          return q.order("date_heure").order("vente_id").order("produit").range(de, a);
        },
        (n) => setExport(`Lecture du détail des articles… ${formateurFCFA.format(n)}`)
      );
      const toutesDepenses = await toutRecuperer<LigneDepense>((de, a) => {
        let q = supabase.from("journal_depenses").select("*").gte("jour", periode.debut).lte("jour", periode.fin);
        if (magasinCible) q = q.eq("magasin_id", magasinCible);
        return q.order("jour").order("depense_id").range(de, a);
      });
      setExport("Préparation du fichier Excel…");
      const fichier = await fabriquerExcel({
        nomMagasin,
        debut: periode.debut,
        fin: periode.fin,
        synthese,
        ventes,
        details,
        depenses: toutesDepenses,
      });
      const nom = nomFichierExport(nomMagasin, periode.debut, periode.fin);
      telecharger(fichier, nom);
      setMessage(`Fichier « ${nom} » téléchargé : ${ventes.length} ventes, ${toutesDepenses.length} dépenses.`);
    } catch (e) {
      setErreur(`Export impossible : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    } finally {
      setExport(null);
    }
  }

  const solde = synthese ? synthese.ventes_total - synthese.depenses_total : 0;
  const modes = synthese ? Object.entries(synthese.par_mode).sort((a, b) => Number(b[1]) - Number(a[1])) : [];

  return (
    <main className="pb-10">
      <EnTetePage
        surtitre={`${nomMagasin} · du ${formaterDate(periode.debut)} au ${formaterDate(periode.fin)}`}
        titre="Comptabilité"
      />

      <div className="px-5 md:px-8 pt-5 max-w-6xl flex flex-col gap-5">
        {/* Période et magasin */}
        <section className="flex flex-wrap items-end gap-2.5" aria-label="Période">
          {CHOIX_PERIODE.map((c) => {
            const actif = choix === c.valeur;
            return (
              <button
                key={c.valeur}
                type="button"
                aria-pressed={actif}
                onClick={() => choisirPeriode(c.valeur)}
                className="h-[46px] px-4 rounded-xl border text-[15px] font-semibold transition-colors"
                style={{
                  borderColor: actif ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                  background: actif ? "var(--couleur-marque)" : "#FFFFFF",
                  color: actif ? "#FFFFFF" : "var(--couleur-texte)",
                }}
              >
                {c.libelle}
              </button>
            );
          })}
          {choix === "perso" && (
            <>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Du
                <input
                  type="date"
                  value={periode.debut}
                  onChange={(e) => setPeriode((p) => ({ ...p, debut: e.target.value }))}
                  className="champ"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Au
                <input
                  type="date"
                  value={periode.fin}
                  onChange={(e) => setPeriode((p) => ({ ...p, fin: e.target.value }))}
                  className="champ"
                />
              </label>
            </>
          )}
          {estAdmin && magasins.length > 1 && (
            <label className="flex flex-col gap-1 text-sm font-semibold ml-auto">
              Magasin
              <select value={magasinFiltre} onChange={(e) => setMagasinFiltre(e.target.value)} className="champ min-w-48">
                <option value="tous">Tous les magasins</option>
                {magasins.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

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

        {/* Chiffres clés */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Chiffres de la période" aria-busy={chargement}>
          <div className="carte p-5 flex flex-col gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--couleur-texte-2)" }}>Ventes encaissées</p>
            <p className="police-titre text-[30px] leading-none font-bold tracking-tight" style={{ color: "var(--couleur-marque)" }}>
              {synthese ? F(synthese.ventes_total) : "…"}
            </p>
            <p className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
              {synthese ? `${formateurFCFA.format(synthese.ventes_nombre)} tickets` : ""}
              {synthese && synthese.ventes_annulees_nombre > 0 && ` · ${synthese.ventes_annulees_nombre} annulé(s), non comptés`}
            </p>
          </div>
          <div className="carte p-5 flex flex-col gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--couleur-texte-2)" }}>Dépenses</p>
            <p className="police-titre text-[30px] leading-none font-bold tracking-tight" style={{ color: "var(--couleur-accent-sombre)" }}>
              {synthese ? F(synthese.depenses_total) : "…"}
            </p>
            <p className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
              {synthese ? `${synthese.depenses_nombre} dépense${synthese.depenses_nombre > 1 ? "s" : ""} saisie${synthese.depenses_nombre > 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <div className="rounded-2xl p-5 flex flex-col gap-2 text-white" style={{ background: "var(--couleur-marque)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--couleur-sur-marque-2)" }}>Ventes − dépenses</p>
            <p className="police-titre text-[30px] leading-none font-bold tracking-tight">{synthese ? F(solde) : "…"}</p>
            <p className="text-[13px]" style={{ color: "var(--couleur-sur-marque)" }}>
              Solde de caisse, pas un bénéfice : seules les dépenses saisies ici sont déduites.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
          {/* Dépenses */}
          <section className="carte p-5 md:p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="titre-section">Dépenses de la période</h2>
              <button
                type="button"
                onClick={() => setFormulaireOuvert((v) => !v)}
                aria-expanded={formulaireOuvert}
                className={`bouton ${formulaireOuvert ? "bouton-secondaire" : "bouton-principal"} min-h-0 h-10 text-sm`}
              >
                <Icone nom={formulaireOuvert ? "fermer" : "plus"} taille={16} />
                {formulaireOuvert ? "Fermer" : "Ajouter une dépense"}
              </button>
            </div>

            {formulaireOuvert && (
              <form
                onSubmit={enregistrerDepense}
                className="rounded-2xl border-2 p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
                style={{ borderColor: "var(--couleur-marque)" }}
              >
                {estAdmin && (
                  <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
                    Magasin
                    <select
                      required
                      value={saisie.magasinId || magasinCible || ""}
                      onChange={(e) => setSaisie((s) => ({ ...s, magasinId: e.target.value }))}
                      className="champ"
                    >
                      <option value="">Choisir…</option>
                      {magasins.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nom}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Date
                  <input
                    type="date"
                    required
                    value={saisie.date}
                    max={aujourdhui()}
                    onChange={(e) => setSaisie((s) => ({ ...s, date: e.target.value }))}
                    className="champ"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Catégorie
                  <select
                    required
                    value={saisie.categorie}
                    onChange={(e) => setSaisie((s) => ({ ...s, categorie: e.target.value as CategorieDepense }))}
                    className="champ"
                  >
                    <option value="">Choisir…</option>
                    {CATEGORIES_DEPENSE.map((c) => (
                      <option key={c.valeur} value={c.valeur}>
                        {c.libelle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
                  Libellé
                  <input
                    required
                    maxLength={200}
                    value={saisie.libelle}
                    onChange={(e) => setSaisie((s) => ({ ...s, libelle: e.target.value }))}
                    placeholder="ex : Facture CIE septembre"
                    className="champ"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Montant (F)
                  <input
                    required
                    inputMode="numeric"
                    value={saisie.montant}
                    onChange={(e) => setSaisie((s) => ({ ...s, montant: e.target.value.replace(/[^\d.,]/g, "") }))}
                    placeholder="0"
                    className="champ text-[17px] font-bold"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Payée par
                  <select
                    value={saisie.mode}
                    onChange={(e) => setSaisie((s) => ({ ...s, mode: e.target.value as ModeDepense }))}
                    className="champ"
                  >
                    {MODES_DEPENSE.map((m) => (
                      <option key={m.valeur} value={m.valeur}>
                        {m.libelle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  <span>
                    Bénéficiaire <span className="font-normal" style={{ color: "var(--couleur-texte-2)" }}>facultatif</span>
                  </span>
                  <input
                    maxLength={120}
                    value={saisie.beneficiaire}
                    onChange={(e) => setSaisie((s) => ({ ...s, beneficiaire: e.target.value }))}
                    placeholder="ex : CIE, propriétaire…"
                    className="champ"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  <span>
                    N° de facture ou reçu <span className="font-normal" style={{ color: "var(--couleur-texte-2)" }}>facultatif</span>
                  </span>
                  <input
                    maxLength={60}
                    value={saisie.piece}
                    onChange={(e) => setSaisie((s) => ({ ...s, piece: e.target.value }))}
                    className="champ"
                  />
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <button type="submit" disabled={enregistrement} className="bouton bouton-principal h-[46px]">
                    {enregistrement ? "Enregistrement…" : "Enregistrer la dépense"}
                  </button>
                </div>
              </form>
            )}

            {depenses.length === 0 ? (
              <p className="text-[15px] py-3" style={{ color: "var(--couleur-texte-2)" }}>
                {chargement ? "Chargement…" : "Aucune dépense saisie sur cette période."}
              </p>
            ) : (
              <ul className="flex flex-col">
                {depenses.map((d) => (
                  <li
                    key={d.depense_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 border-t"
                    style={{ borderColor: "var(--couleur-ligne)" }}
                  >
                    <span className="w-24 text-sm" style={{ color: "var(--couleur-texte-2)" }}>
                      {formaterDate(d.jour)}
                    </span>
                    <span className="flex-1 basis-48 min-w-0">
                      <span className="block text-[15px] font-semibold truncate">{d.libelle}</span>
                      <span className="block text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
                        {libelleCategorie(d.categorie)} · {libelleModeDepense(d.mode_paiement)}
                        {d.beneficiaire && ` · ${d.beneficiaire}`}
                        {!magasinCible && ` · ${d.magasin}`}
                      </span>
                    </span>
                    <span className="text-[15px] font-bold">{F(Number(d.montant))}</span>
                    <button
                      type="button"
                      onClick={() => supprimerDepense(d)}
                      aria-label={`Supprimer la dépense ${d.libelle}`}
                      className="w-10 h-10 flex items-center justify-center rounded-lg"
                      style={{ color: "var(--couleur-danger)" }}
                    >
                      <Icone nom="corbeille" taille={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Export et répartition */}
          <div className="flex flex-col gap-4">
            <section className="carte p-5 md:p-6 flex flex-col gap-3">
              <h2 className="titre-section">Pour le comptable</h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--couleur-texte-2)" }}>
                Un fichier Excel avec la synthèse, les ventes jour par jour, chaque ticket, le détail des articles
                vendus et les dépenses de la période.
              </p>
              <button
                type="button"
                onClick={exporter}
                disabled={!synthese || export_ !== null}
                className="bouton bouton-accent h-[52px] police-titre text-[17px] font-bold"
              >
                <Icone nom="telecharger" taille={20} />
                {export_ ? "Export en cours…" : "Télécharger l'export Excel"}
              </button>
              {export_ && (
                <p role="status" className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
                  {export_}
                </p>
              )}
            </section>

            {synthese && modes.length > 0 && (
              <section className="carte p-5 md:p-6 flex flex-col gap-3">
                <h2 className="titre-section">Encaissements</h2>
                <ul className="flex flex-col gap-2.5">
                  {modes.map(([mode, total]) => (
                    <li key={mode} className="flex justify-between gap-3 text-[15px]">
                      <span>{MODES_VENTE[mode] ?? mode}</span>
                      <span className="font-bold">{F(Number(total))}</span>
                    </li>
                  ))}
                </ul>
                {Object.keys(synthese.par_operateur).length > 0 && (
                  <ul className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: "var(--couleur-ligne)" }}>
                    {Object.entries(synthese.par_operateur).map(([op, total]) => (
                      <li key={op} className="flex justify-between gap-3 text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
                        <span>dont {OPERATEURS[op] ?? op}</span>
                        <span>{F(Number(total))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
