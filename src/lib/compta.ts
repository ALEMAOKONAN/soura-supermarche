// ============================================================================
// Module comptable : libellés, périodes, lecture paginée des journaux et
// fabrication du fichier Excel remis au comptable.
// Montants en francs CFA, TTC (la TVA n'est pas ventilée).
// ============================================================================

export const CATEGORIES_DEPENSE = [
  { valeur: "achats_marchandises", libelle: "Achats de marchandises" },
  { valeur: "loyer", libelle: "Loyer" },
  { valeur: "electricite", libelle: "Électricité" },
  { valeur: "eau", libelle: "Eau" },
  { valeur: "salaires", libelle: "Salaires et primes" },
  { valeur: "transport", libelle: "Transport et livraison" },
  { valeur: "carburant", libelle: "Carburant" },
  { valeur: "telephone_internet", libelle: "Téléphone et internet" },
  { valeur: "impots_taxes", libelle: "Impôts et taxes" },
  { valeur: "entretien", libelle: "Entretien et réparations" },
  { valeur: "fournitures", libelle: "Fournitures et emballages" },
  { valeur: "frais_bancaires", libelle: "Frais bancaires et Mobile Money" },
  { valeur: "publicite", libelle: "Publicité" },
  { valeur: "autre", libelle: "Autre dépense" },
] as const;
export type CategorieDepense = (typeof CATEGORIES_DEPENSE)[number]["valeur"];

export const MODES_DEPENSE = [
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "mobile_money", libelle: "Mobile Money" },
  { valeur: "virement", libelle: "Virement" },
  { valeur: "cheque", libelle: "Chèque" },
  { valeur: "carte", libelle: "Carte" },
] as const;
export type ModeDepense = (typeof MODES_DEPENSE)[number]["valeur"];

export const MODES_VENTE: Record<string, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte: "Carte",
  credit_client: "Crédit client",
};

export const OPERATEURS: Record<string, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  moov_money: "Moov Money",
  wave: "Wave",
  non_precise: "Non précisé",
};

export const libelleCategorie = (v: string) => CATEGORIES_DEPENSE.find((c) => c.valeur === v)?.libelle ?? v;
export const libelleModeDepense = (v: string) => MODES_DEPENSE.find((m) => m.valeur === v)?.libelle ?? v;

// --- Périodes (Abidjan = UTC toute l'année, pas d'heure d'été) --------------
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function aujourdhui(): string {
  return iso(new Date());
}

export function periodePredefinie(nom: "mois" | "mois_precedent" | "annee"): { debut: string; fin: string } {
  const n = new Date();
  const a = n.getUTCFullYear();
  const m = n.getUTCMonth();
  if (nom === "mois") return { debut: iso(new Date(Date.UTC(a, m, 1))), fin: iso(new Date(Date.UTC(a, m + 1, 0))) };
  if (nom === "mois_precedent")
    return { debut: iso(new Date(Date.UTC(a, m - 1, 1))), fin: iso(new Date(Date.UTC(a, m, 0))) };
  return { debut: `${a}-01-01`, fin: `${a}-12-31` };
}

export function formaterDate(jour: string): string {
  const [a, m, j] = jour.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

// --- Types des journaux (vues SQL) --------------------------------------------
export type LigneJournalVente = {
  vente_id: string;
  magasin: string;
  date_heure: string;
  jour: string;
  numero_ticket: string;
  caissier: string | null;
  mode_paiement: string;
  operateur_mobile: string | null;
  reference_paiement: string | null;
  montant_total: number;
  statut: string;
  hors_ligne: boolean;
  client: string | null;
};

export type LigneDetailVente = {
  vente_id: string;
  magasin: string;
  date_heure: string;
  jour: string;
  numero_ticket: string;
  produit: string;
  code_barre: string | null;
  quantite: number;
  prix_unitaire: number;
  sous_total: number;
  statut: string;
};

export type LigneDepense = {
  depense_id: string;
  magasin_id: string;
  magasin: string;
  jour: string;
  categorie: string;
  libelle: string;
  montant: number;
  mode_paiement: string;
  beneficiaire: string | null;
  numero_piece: string | null;
  saisi_par: string | null;
};

export type Synthese = {
  ventes_total: number;
  ventes_nombre: number;
  ventes_annulees_nombre: number;
  ventes_annulees_total: number;
  par_mode: Record<string, number>;
  par_operateur: Record<string, number>;
  depenses_total: number;
  depenses_nombre: number;
  par_categorie: Record<string, number>;
};

// --- Lecture paginée (Supabase renvoie au plus 1 000 lignes par requête) ------
type Reponse<T> = { data: T[] | null; error: { message: string } | null };

export async function toutRecuperer<T>(
  page: (de: number, a: number) => PromiseLike<Reponse<T>>,
  surProgres?: (nombre: number) => void
): Promise<T[]> {
  const TAILLE = 1000;
  const tout: T[] = [];
  for (let de = 0; ; de += TAILLE) {
    const { data, error } = await page(de, de + TAILLE - 1);
    if (error) throw new Error(error.message);
    tout.push(...(data ?? []));
    surProgres?.(tout.length);
    if (!data || data.length < TAILLE) return tout;
  }
}

// --- Fichier Excel -------------------------------------------------------------
// « 2026-10-10T23:30:00 » (heure d'Abidjan, sans fuseau) → date Excel exacte,
// quel que soit le fuseau réglé sur l'ordinateur.
function dateExcel(valeur: string): Date {
  const [j, h = "00:00:00"] = valeur.split("T");
  const [a, m, d] = j.split("-").map(Number);
  const [hh, mi, ss] = h.split(":").map((x) => Math.floor(Number(x)));
  return new Date(Date.UTC(a, m - 1, d, hh || 0, mi || 0, ss || 0));
}

export type DonneesExport = {
  nomMagasin: string;
  debut: string;
  fin: string;
  synthese: Synthese;
  ventes: LigneJournalVente[];
  details: LigneDetailVente[];
  depenses: LigneDepense[];
};

export async function fabriquerExcel(d: DonneesExport): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const classeur = new ExcelJS.Workbook();
  classeur.creator = "SOURA Marché";
  classeur.created = new Date();

  const VERT = "FF0B3B2C";
  const FORMAT_F = '#,##0" F"';
  const FORMAT_QTE = "#,##0.###";

  type Colonne = { titre: string; largeur: number; format?: string; somme?: boolean };
  function feuilleTableau(nom: string, colonnes: Colonne[], lignes: (string | number | Date | null)[][]) {
    const f = classeur.addWorksheet(nom, { views: [{ state: "frozen", ySplit: 1 }] });
    f.columns = colonnes.map((c) => ({ header: c.titre, width: c.largeur, style: c.format ? { numFmt: c.format } : {} }));
    const entete = f.getRow(1);
    entete.font = { bold: true, color: { argb: "FFFFFFFF" } };
    entete.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT } };
    entete.alignment = { vertical: "middle" };
    entete.height = 22;
    lignes.forEach((l) => f.addRow(l));
    if (lignes.length > 0) {
      f.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonnes.length } };
      // Ligne de total, avec de vraies formules (le comptable peut filtrer/modifier)
      const derniere = lignes.length + 1;
      const total = f.addRow([]);
      total.getCell(1).value = "TOTAL";
      colonnes.forEach((c, i) => {
        if (!c.somme) return;
        const lettre = f.getColumn(i + 1).letter;
        const resultat = lignes.reduce((s, l) => s + (typeof l[i] === "number" ? (l[i] as number) : 0), 0);
        total.getCell(i + 1).value = { formula: `SUBTOTAL(9,${lettre}2:${lettre}${derniere})`, result: resultat };
      });
      total.font = { bold: true };
      total.border = { top: { style: "thin" } };
    }
    return f;
  }

  const s = d.synthese;
  const validees = d.ventes.filter((v) => v.statut === "validee");

  // 1. Synthèse
  const fs = classeur.addWorksheet("Synthèse");
  fs.columns = [{ width: 42 }, { width: 20 }, { width: 18 }];
  fs.addRow(["SOURA Marché — Export comptable"]).font = { bold: true, size: 16, color: { argb: VERT } };
  fs.addRow(["Magasin", d.nomMagasin]);
  fs.addRow(["Période", `du ${formaterDate(d.debut)} au ${formaterDate(d.fin)}`]);
  fs.addRow(["Fichier généré le", new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan" })]);
  fs.addRow(["Montants", "en francs CFA, TTC (TVA non ventilée)"]);
  fs.addRow([]);
  const bloc = (titre: string) => {
    const r = fs.addRow([titre]);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT } };
  };
  const ligne = (libelle: string, montant: number, detail?: string | number, gras = false) => {
    const r = fs.addRow([libelle, montant, detail ?? null]);
    r.getCell(2).numFmt = FORMAT_F;
    r.getCell(3).alignment = { indent: 2 };
    r.getCell(3).font = { color: { argb: "FF4D5A53" } };
    if (gras) r.font = { bold: true };
  };
  bloc("VENTES");
  ligne("Ventes encaissées", s.ventes_total, `${s.ventes_nombre} tickets`, true);
  ligne("Ventes annulées (non comptées)", s.ventes_annulees_total, `${s.ventes_annulees_nombre} tickets`);
  fs.addRow([]);
  bloc("ENCAISSEMENTS PAR MODE DE PAIEMENT");
  Object.entries(s.par_mode).forEach(([mode, total]) => ligne(MODES_VENTE[mode] ?? mode, Number(total)));
  if (Object.keys(s.par_operateur).length > 0) {
    fs.addRow([]);
    bloc("MOBILE MONEY PAR OPÉRATEUR");
    Object.entries(s.par_operateur).forEach(([op, total]) => ligne(OPERATEURS[op] ?? op, Number(total)));
  }
  fs.addRow([]);
  bloc("DÉPENSES PAR CATÉGORIE");
  Object.entries(s.par_categorie).forEach(([cat, total]) => ligne(libelleCategorie(cat), Number(total)));
  ligne("Total des dépenses", s.depenses_total, `${s.depenses_nombre} dépenses`, true);
  fs.addRow([]);
  bloc("RÉSULTAT DE CAISSE");
  ligne("Ventes encaissées − dépenses", s.ventes_total - s.depenses_total, undefined, true);
  fs.addRow([]);
  fs.addRow([
    "Ce solde n'est pas un bénéfice comptable : il ne tient compte que des dépenses saisies dans SOURA Marché.",
  ]).font = { italic: true, color: { argb: "FF4D5A53" } };

  // 2. Ventes par jour
  const jours = new Map<string, { n: number; modes: Record<string, number>; total: number; depenses: number }>();
  const jourVide = () => ({ n: 0, modes: {} as Record<string, number>, total: 0, depenses: 0 });
  for (let t = dateExcel(d.debut).getTime(); t <= dateExcel(d.fin).getTime(); t += 86400000) {
    jours.set(new Date(t).toISOString().slice(0, 10), jourVide());
  }
  validees.forEach((v) => {
    const j = jours.get(v.jour) ?? jourVide();
    j.n += 1;
    j.total += Number(v.montant_total);
    j.modes[v.mode_paiement] = (j.modes[v.mode_paiement] ?? 0) + Number(v.montant_total);
    jours.set(v.jour, j);
  });
  d.depenses.forEach((x) => {
    const j = jours.get(x.jour) ?? jourVide();
    j.depenses += Number(x.montant);
    jours.set(x.jour, j);
  });
  feuilleTableau(
    "Ventes par jour",
    [
      { titre: "Jour", largeur: 13, format: "dd/mm/yyyy" },
      { titre: "Tickets", largeur: 10, format: "#,##0", somme: true },
      { titre: "Espèces", largeur: 15, format: FORMAT_F, somme: true },
      { titre: "Mobile Money", largeur: 15, format: FORMAT_F, somme: true },
      { titre: "Carte", largeur: 14, format: FORMAT_F, somme: true },
      { titre: "Crédit client", largeur: 14, format: FORMAT_F, somme: true },
      { titre: "Total ventes", largeur: 16, format: FORMAT_F, somme: true },
      { titre: "Dépenses", largeur: 15, format: FORMAT_F, somme: true },
      { titre: "Solde du jour", largeur: 16, format: FORMAT_F, somme: true },
    ],
    [...jours.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([jour, j]) => [
        dateExcel(jour),
        j.n,
        j.modes.especes ?? 0,
        j.modes.mobile_money ?? 0,
        j.modes.carte ?? 0,
        j.modes.credit_client ?? 0,
        j.total,
        j.depenses,
        j.total - j.depenses,
      ])
  );

  // 3. Journal des ventes (une ligne par ticket)
  feuilleTableau(
    "Ventes",
    [
      { titre: "Date et heure", largeur: 17, format: "dd/mm/yyyy hh:mm" },
      { titre: "N° ticket", largeur: 11 },
      { titre: "Magasin", largeur: 18 },
      { titre: "Caissier", largeur: 20 },
      { titre: "Mode de paiement", largeur: 16 },
      { titre: "Opérateur", largeur: 14 },
      { titre: "Référence paiement", largeur: 20 },
      { titre: "Client fidélité", largeur: 18 },
      { titre: "Montant TTC", largeur: 15, format: FORMAT_F, somme: true },
      { titre: "Statut", largeur: 10 },
      { titre: "Faite hors ligne", largeur: 14 },
    ],
    d.ventes.map((v) => [
      dateExcel(v.date_heure),
      v.numero_ticket,
      v.magasin,
      v.caissier ?? "",
      MODES_VENTE[v.mode_paiement] ?? v.mode_paiement,
      v.operateur_mobile ? (OPERATEURS[v.operateur_mobile] ?? v.operateur_mobile) : "",
      v.reference_paiement ?? "",
      v.client ?? "",
      // Une vente annulée reste visible mais compte pour 0 dans le total
      v.statut === "validee" ? Number(v.montant_total) : 0,
      v.statut === "validee" ? "Validée" : "Annulée",
      v.hors_ligne ? "Oui" : "Non",
    ])
  );

  // 4. Détail des articles vendus
  feuilleTableau(
    "Détail des ventes",
    [
      { titre: "Date et heure", largeur: 17, format: "dd/mm/yyyy hh:mm" },
      { titre: "N° ticket", largeur: 11 },
      { titre: "Magasin", largeur: 18 },
      { titre: "Article", largeur: 32 },
      { titre: "Code-barres", largeur: 16 },
      { titre: "Quantité", largeur: 10, format: FORMAT_QTE, somme: true },
      { titre: "Prix unitaire", largeur: 14, format: FORMAT_F },
      { titre: "Montant TTC", largeur: 15, format: FORMAT_F, somme: true },
      { titre: "Statut", largeur: 10 },
    ],
    d.details.map((l) => [
      dateExcel(l.date_heure),
      l.numero_ticket,
      l.magasin,
      l.produit,
      l.code_barre ?? "",
      Number(l.quantite),
      Number(l.prix_unitaire),
      l.statut === "validee" ? Number(l.sous_total) : 0,
      l.statut === "validee" ? "Validée" : "Annulée",
    ])
  );

  // 5. Dépenses
  feuilleTableau(
    "Dépenses",
    [
      { titre: "Date", largeur: 12, format: "dd/mm/yyyy" },
      { titre: "Magasin", largeur: 18 },
      { titre: "Catégorie", largeur: 26 },
      { titre: "Libellé", largeur: 32 },
      { titre: "Bénéficiaire", largeur: 20 },
      { titre: "N° de pièce", largeur: 14 },
      { titre: "Mode de paiement", largeur: 16 },
      { titre: "Montant", largeur: 15, format: FORMAT_F, somme: true },
      { titre: "Saisi par", largeur: 18 },
    ],
    d.depenses.map((x) => [
      dateExcel(x.jour),
      x.magasin,
      libelleCategorie(x.categorie),
      x.libelle,
      x.beneficiaire ?? "",
      x.numero_piece ?? "",
      libelleModeDepense(x.mode_paiement),
      Number(x.montant),
      x.saisi_par ?? "",
    ])
  );

  const tampon = await classeur.xlsx.writeBuffer();
  return new Blob([tampon], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function telecharger(fichier: Blob, nom: string) {
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function nomFichierExport(nomMagasin: string, debut: string, fin: string) {
  const propre = nomMagasin
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `SOURA-compta_${propre || "magasin"}_${debut}_${fin}.xlsx`;
}
