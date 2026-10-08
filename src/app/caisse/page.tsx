"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import Icone from "@/components/Icone";
import Logo from "@/components/Logo";
import { bipErreur, bipOk } from "@/lib/sons";
import BoutonRafraichir from "@/components/BoutonRafraichir";
import {
  ajouterAFile,
  chercherDansCatalogue,
  enregistrerCatalogue,
  enregistrerProfil,
  lireCatalogue,
  estErreurReseau,
  lireFile,
  lireProfil,
  marquerErreur,
  nouvelIdentifiant,
  retirerDeFile,
  type ProfilCaisse,
  type VenteEnAttente,
} from "@/lib/hors-ligne";

type Produit = {
  id: string;
  nom: string;
  code_barre: string | null;
  unite: "piece" | "kg" | "g" | "l" | "ml";
  prix_vente: number;
  est_pese: boolean;
};

type LignePanier = {
  produit: Produit;
  quantite: number;
};

type Client = { id: string; nom: string; points_cumules: number };

// Instantané d'une vente validée, figé au moment de l'encaissement : le
// panier est vidé juste après, le reçu doit donc garder sa propre copie.
type TicketRecu = {
  venteId: string;
  date: Date;
  lignes: { nom: string; quantite: number; prixUnitaire: number }[];
  total: number;
  modePaiement: string;
  operateur: string | null;
  referencePaiement: string | null;
  montantRecu: number | null;
  monnaie: number | null;
  client: { nom: string; pointsGagnes: number; soldePoints: number } | null;
  horsLigne: boolean;
};

type InfosMagasin = { nomMagasin: string; adresse: string; nomCaissier: string };

const MODES_PAIEMENT = [
  { valeur: "especes", libelle: "Espèces", touche: "F1" },
  { valeur: "mobile_money", libelle: "Mobile Money", touche: "F2" },
  { valeur: "carte", libelle: "Carte", touche: "F3" },
] as const;

// Opérateurs Mobile Money de Côte d'Ivoire. La pastille de couleur aide à
// reconnaître l'opérateur d'un coup d'œil.
const OPERATEURS_MOBILE = [
  { valeur: "orange_money", libelle: "Orange Money", couleur: "#FF7900" },
  { valeur: "mtn_momo", libelle: "MTN MoMo", couleur: "#FFCB05" },
  { valeur: "moov_money", libelle: "Moov Money", couleur: "#0A5EB0" },
  { valeur: "wave", libelle: "Wave", couleur: "#1DC8F2" },
] as const;
type OperateurMobile = (typeof OPERATEURS_MOBILE)[number]["valeur"];
const libelleOperateur = (v?: string | null) => OPERATEURS_MOBILE.find((o) => o.valeur === v)?.libelle ?? null;

// Raccourcis rappelés sous la barre de scan (écrans avec clavier)
const AIDE_RACCOURCIS: [string, string][] = [
  ["Entrée", "ajouter"],
  ["6*", "quantité"],
  ["+ / −", "dernier article"],
  ["F1 F2 F3", "paiement"],
  ["F4", "montant reçu"],
  ["F12", "encaisser"],
  ["Échap", "annuler"],
];

// Un code-barres : uniquement des chiffres (au moins 4)
const RE_CODE_BARRE = /^\d{4,}$/;
// Quantité tapée avant le scan : « 6* » ou « 1,5* » (poids en kg)
const RE_MULTIPLICATEUR = /^(\d{1,4}(?:[.,]\d{1,3})?)\*$/;

function Touche({ children, claire = false }: { children: React.ReactNode; claire?: boolean }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md text-[11px] font-bold font-sans"
      style={{
        background: claire ? "rgba(255,255,255,0.18)" : "#FFFFFF",
        border: claire ? "1px solid rgba(255,255,255,0.35)" : "1px solid var(--couleur-bordure-forte)",
        color: claire ? "#FFFFFF" : "var(--couleur-texte-2)",
      }}
    >
      {children}
    </kbd>
  );
}

const formateurFCFA = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const formateurQuantite = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

// Montants que le client tend le plus souvent : le compte exact, puis les
// montants ronds juste au-dessus du total (1 000, 5 000, 10 000…).
function montantsProposes(total: number): number[] {
  if (total <= 0) return [];
  const montants = [total];
  for (const pas of [1000, 5000, 10000]) {
    const m = Math.ceil(total / pas) * pas;
    if (!montants.includes(m)) montants.push(m);
  }
  let suivant = Math.ceil(total / 10000) * 10000;
  while (montants.length < 4) {
    suivant += 10000;
    montants.push(suivant);
  }
  return montants.slice(0, 4);
}

// Articles en tuiles, faciles à toucher sur un écran tactile.
function TuilesArticles({
  produits,
  onChoisir,
  surligne,
}: {
  produits: Produit[];
  onChoisir: (p: Produit) => void;
  surligne?: string;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
      {produits.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => onChoisir(p)}
            className="relative w-full h-full min-h-[120px] flex flex-col gap-2 p-3.5 rounded-[14px] bg-white text-left transition-colors hover:border-[var(--couleur-marque)] hover:bg-[#F7FAF8]"
            style={{
              border: surligne === p.id ? "2px solid var(--couleur-marque)" : "1px solid var(--couleur-bordure)",
            }}
          >
            {surligne === p.id && (
              <span className="absolute top-2 right-2 hidden md:inline-flex">
                <Touche>Entrée</Touche>
              </span>
            )}
            <span className={`text-[15px] font-semibold leading-snug ${surligne === p.id ? "md:pr-14" : ""}`}>{p.nom}</span>
            {p.est_pese && (
              <span className="pastille pastille-neutre self-start text-xs">au poids</span>
            )}
            <span className="mt-auto police-titre text-xl font-bold" style={{ color: "var(--couleur-marque)" }}>
              {formateurFCFA.format(p.prix_vente)} F
              {p.est_pese && <span className="text-sm font-semibold"> /kg</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function PageCaisse() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Produit[]>([]);
  const [panier, setPanier] = useState<LignePanier[]>([]);
  // Derniers articles ajoutés (pour les reprendre d'un geste)
  const [recents, setRecents] = useState<Produit[]>([]);
  // Quantité tapée avant le scan (« 6* »), appliquée au prochain article
  const [multiplicateur, setMultiplicateur] = useState<number | null>(null);
  // Message affiché quand un code scanné est inconnu
  const [alerteScan, setAlerteScan] = useState<string | null>(null);
  // Dernière ligne touchée : surlignée un instant, et visée par + / −
  const [derniereLigne, setDerniereLigne] = useState<{ id: string; n: number } | null>(null);
  const [fideliteOuverte, setFideliteOuverte] = useState(false);
  // Mobile Money : opérateur choisi et référence de la transaction
  const [operateur, setOperateur] = useState<OperateurMobile | null>(null);
  const [referencePaiement, setReferencePaiement] = useState("");
  const champScanRef = useRef<HTMLInputElement>(null);
  const champMontantRef = useRef<HTMLInputElement>(null);
  // Texte tapé dans le champ quantité d'une ligne du ticket, tant qu'il
  // n'a pas été validé (permet d'effacer/retaper sans que la ligne saute).
  const [quantiteSaisie, setQuantiteSaisie] = useState<Record<string, string>>({});
  const [modePaiement, setModePaiement] = useState<(typeof MODES_PAIEMENT)[number]["valeur"]>("especes");
  const [montantRecu, setMontantRecu] = useState<string>("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [derniereVenteTotal, setDerniereVenteTotal] = useState<number | null>(null);
  const [roleUtilisateur, setRoleUtilisateur] = useState<string | null>(null);
  const [infosMagasin, setInfosMagasin] = useState<InfosMagasin | null>(null);
  const [dernierTicket, setDernierTicket] = useState<TicketRecu | null>(null);

  // Mode hors ligne
  const [enLigne, setEnLigne] = useState(true);
  const [profilCaisse, setProfilCaisse] = useState<ProfilCaisse | null>(null);
  const [fileAttente, setFileAttente] = useState<VenteEnAttente[]>([]);
  const [synchroEnCours, setSynchroEnCours] = useState(false);
  const synchroVerrou = useRef(false);

  // Fidélité — rattachement d'un client optionnel au moment du paiement
  const [telephoneClient, setTelephoneClient] = useState("");
  const [clientTrouve, setClientTrouve] = useState<Client | null>(null);
  const [rechercheClientFaite, setRechercheClientFaite] = useState(false);
  const [nomNouveauClient, setNomNouveauClient] = useState("");
  const [pointsGagnes, setPointsGagnes] = useState<number | null>(null);

  // --- Chargement initial -----------------------------------------------------
  // En ligne : on lit le profil depuis la base et on le mémorise sur le poste.
  // Hors ligne : on reprend le profil mémorisé, pour pouvoir encaisser quand même.
  const appliquerProfil = useCallback((profil: ProfilCaisse) => {
    setProfilCaisse(profil);
    setRoleUtilisateur(profil.role);
    setInfosMagasin({
      nomMagasin: profil.nomMagasin,
      adresse: profil.adresse,
      nomCaissier: profil.nomCaissier,
    });
  }, []);

  // Catalogue complet gardé sur le poste, pour chercher et scanner sans internet.
  const rafraichirCatalogue = useCallback(async () => {
    const { data, error } = await supabase
      .from("produits")
      .select("id, nom, code_barre, unite, prix_vente, est_pese")
      .eq("actif", true)
      .order("nom");
    if (!error && data) enregistrerCatalogue(data);
  }, [supabase]);

  useEffect(() => {
    // Service worker : permet de rouvrir la caisse même sans connexion.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    setEnLigne(navigator.onLine);
    setFileAttente(lireFile());

    // Le catalogue se charge en même temps que le profil, sans l'attendre.
    if (navigator.onLine) rafraichirCatalogue();

    async function chargerProfil() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("session indisponible");
        const { data: profil, error } = await supabase
          .from("utilisateurs")
          .select("role, organisation_id, magasin_id, nom_complet, magasins(nom, adresse, ville)")
          .eq("id", session.user.id)
          .single();
        if (error) throw error;
        if (!profil) return;

        const magasin = profil.magasins as unknown as { nom: string; adresse: string | null; ville: string | null } | null;
        const complet: ProfilCaisse = {
          role: profil.role,
          organisation_id: profil.organisation_id,
          magasin_id: profil.magasin_id,
          nomCaissier: profil.nom_complet,
          nomMagasin: magasin?.nom ?? "SOURA Marché",
          adresse: [magasin?.adresse, magasin?.ville].filter(Boolean).join(", "),
        };
        enregistrerProfil(complet);
        appliquerProfil(complet);
      } catch {
        // Pas de connexion : on travaille avec le profil mémorisé sur le poste.
        const memorise = lireProfil();
        if (memorise) appliquerProfil(memorise);
      }
    }
    chargerProfil();

    // Catalogue remis à jour toutes les 5 minutes tant que la connexion tient.
    const intervalleCatalogue = setInterval(() => {
      if (navigator.onLine) rafraichirCatalogue();
    }, 5 * 60 * 1000);

    const passerEnLigne = () => setEnLigne(true);
    const passerHorsLigne = () => setEnLigne(false);
    window.addEventListener("online", passerEnLigne);
    window.addEventListener("offline", passerHorsLigne);
    return () => {
      clearInterval(intervalleCatalogue);
      window.removeEventListener("online", passerEnLigne);
      window.removeEventListener("offline", passerHorsLigne);
    };
  }, [supabase, appliquerProfil, rafraichirCatalogue]);

  // --- Synchronisation des ventes en attente ---------------------------------
  // Envoie les ventes une par une. S'arrête à la première coupure réseau ;
  // une vente refusée par la base reste en file avec son message d'erreur.
  const synchroniser = useCallback(async () => {
    if (synchroVerrou.current || !navigator.onLine) return;
    const file = lireFile();
    if (file.length === 0) return;

    synchroVerrou.current = true;
    setSynchroEnCours(true);
    try {
      for (const vente of file) {
        const { error } = await supabase.rpc("synchroniser_vente_hors_ligne", {
          p_vente_id: vente.id,
          p_magasin_id: vente.magasin_id,
          p_mode_paiement: vente.mode_paiement,
          p_lignes: vente.lignes,
          p_date_vente: vente.date,
          // Envoyés seulement s'ils existent : les ventes gardées avant la mise
          // à jour restent compatibles.
          ...(vente.operateur_mobile ? { p_operateur_mobile: vente.operateur_mobile } : {}),
          ...(vente.reference_paiement ? { p_reference_paiement: vente.reference_paiement } : {}),
        });
        if (!error) {
          retirerDeFile(vente.id);
        } else if (estErreurReseau(error)) {
          setEnLigne(false);
          break;
        } else {
          marquerErreur(vente.id, error.message);
        }
      }
    } finally {
      setFileAttente(lireFile());
      synchroVerrou.current = false;
      setSynchroEnCours(false);
    }
  }, [supabase]);

  // Dès que la connexion revient, et toutes les 30 secondes par précaution.
  useEffect(() => {
    if (enLigne) synchroniser();
    const intervalle = setInterval(synchroniser, 30 * 1000);
    return () => clearInterval(intervalle);
  }, [enLigne, synchroniser]);

  // Impression automatique : dès qu'une vente est validée, un nouveau ticket
  // est créé, et on lance l'impression. Le court délai laisse React afficher
  // le ticket dans la page avant que le navigateur ne l'imprime.
  useEffect(() => {
    if (!dernierTicket) return;
    const minuteur = setTimeout(() => window.print(), 300);
    return () => clearTimeout(minuteur);
  }, [dernierTicket]);

  // Recherche produit (nom ou code-barre) :
  //  1. réponse immédiate depuis le catalogue gardé sur le poste (aucune attente réseau) ;
  //  2. puis vérification discrète auprès du serveur, qui met à jour les prix
  //     et trouve un article créé depuis la dernière mise à jour du catalogue.
  useEffect(() => {
    const terme = recherche.trim();
    if (terme.length < 2) {
      setResultats([]);
      return;
    }
    setResultats(chercherDansCatalogue(terme));
    if (!navigator.onLine) return;

    let annule = false;
    const delai = setTimeout(async () => {
      // Caractères qui ont un sens dans le filtre PostgREST : on les neutralise.
      const saisie = terme.replace(/[,()*%\\]/g, " ");
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom, code_barre, unite, prix_vente, est_pese")
        .eq("actif", true)
        .or(`nom.ilike.%${saisie}%,code_barre.eq.${saisie}`)
        .limit(8);
      if (annule) return;
      if (error) {
        if (estErreurReseau(error)) setEnLigne(false);
        return; // on garde les résultats du poste
      }
      if (data && data.length > 0) {
        // Code-barre exact en tête, comme pour la recherche locale
        setResultats([...data].sort((x, y) => Number(y.code_barre === terme) - Number(x.code_barre === terme)));
      }
    }, 300);
    return () => {
      annule = true;
      clearTimeout(delai);
    };
  }, [recherche, supabase]);

  function eclairerLigne(produitId: string) {
    setDerniereLigne((d) => ({ id: produitId, n: (d?.n ?? 0) + 1 }));
    requestAnimationFrame(() =>
      document.getElementById(`ligne-${produitId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    );
  }

  function ajouterAuPanier(produit: Produit) {
    const ajout = multiplicateur ?? 1;
    setPanier((actuel) => {
      const existant = actuel.find((l) => l.produit.id === produit.id);
      if (existant) {
        return actuel.map((l) =>
          l.produit.id === produit.id ? { ...l, quantite: Number((l.quantite + ajout).toFixed(3)) } : l
        );
      }
      return [...actuel, { produit, quantite: ajout }];
    });
    setRecents((actuels) => [produit, ...actuels.filter((p) => p.id !== produit.id)].slice(0, 12));
    setRecherche("");
    setResultats([]);
    setMultiplicateur(null);
    setAlerteScan(null);
    eclairerLigne(produit.id);
    bipOk();
    champScanRef.current?.focus();
  }

  function signalerIntrouvable(saisie: string) {
    setAlerteScan(
      RE_CODE_BARRE.test(saisie)
        ? `Code-barres inconnu : ${saisie}. Vérifiez l'article ou cherchez-le par son nom.`
        : `Aucun article ne correspond à « ${saisie} ».`
    );
    setRecherche("");
    setResultats([]);
    bipErreur();
    champScanRef.current?.focus();
  }

  // Touche Entrée dans la barre de scan (le lecteur de code-barres l'envoie
  // tout seul après chaque code) : l'article est ajouté directement.
  async function validerSaisie() {
    const saisie = recherche.trim();
    if (!saisie) return;

    if (RE_CODE_BARRE.test(saisie)) {
      const local = lireCatalogue().find((p) => p.code_barre === saisie);
      if (local) return ajouterAuPanier(local);
      if (navigator.onLine) {
        const { data } = await supabase
          .from("produits")
          .select("id, nom, code_barre, unite, prix_vente, est_pese")
          .eq("actif", true)
          .eq("code_barre", saisie)
          .maybeSingle();
        if (data) return ajouterAuPanier(data);
      }
      return signalerIntrouvable(saisie);
    }

    const trouves = resultats.length > 0 ? resultats : chercherDansCatalogue(saisie);
    if (trouves.length > 0) return ajouterAuPanier(trouves[0]);
    signalerIntrouvable(saisie);
  }

  function changerRecherche(valeur: string) {
    setAlerteScan(null);
    const m = valeur.trim().match(RE_MULTIPLICATEUR);
    if (m) {
      const q = Number(m[1].replace(",", "."));
      if (q > 0) {
        setMultiplicateur(q);
        setRecherche("");
        return;
      }
    }
    setRecherche(valeur);
  }

  // + / − sur le dernier article ajouté (ou le dernier du ticket)
  function ajusterDerniereLigne(delta: number) {
    const cible =
      panier.find((l) => l.produit.id === derniereLigne?.id) ?? panier[panier.length - 1];
    if (!cible) return;
    const pas = cible.produit.est_pese ? 0.1 : 1;
    modifierQuantite(cible.produit.id, Number((cible.quantite + delta * pas).toFixed(3)));
    eclairerLigne(cible.produit.id);
  }

  function modifierQuantite(produitId: string, quantite: number) {
    if (quantite <= 0) {
      setPanier((actuel) => actuel.filter((l) => l.produit.id !== produitId));
      return;
    }
    setPanier((actuel) =>
      actuel.map((l) => (l.produit.id === produitId ? { ...l, quantite } : l))
    );
  }

  function supprimerLigne(produitId: string) {
    setPanier((actuel) => actuel.filter((l) => l.produit.id !== produitId));
  }

  function viderTicket() {
    setPanier([]);
  }

  const total = panier.reduce((somme, l) => somme + l.quantite * l.produit.prix_vente, 0);
  const monnaieARendre =
    modePaiement === "especes" && montantRecu !== ""
      ? Math.max(0, Number(montantRecu) - total)
      : null;

  async function chercherClient() {
    if (!telephoneClient.trim()) return;
    setRechercheClientFaite(false);
    const { data } = await supabase
      .from("clients")
      .select("id, nom, points_cumules")
      .eq("telephone", telephoneClient.trim())
      .maybeSingle();
    setClientTrouve(data);
    setRechercheClientFaite(true);
  }

  async function creerClient() {
    if (!nomNouveauClient.trim()) return;
    const organisationId = profilCaisse?.organisation_id;
    if (!organisationId) return;

    const { data, error } = await supabase
      .from("clients")
      .insert({ organisation_id: organisationId, nom: nomNouveauClient.trim(), telephone: telephoneClient.trim() })
      .select("id, nom, points_cumules")
      .single();

    if (!error && data) {
      setClientTrouve(data);
      setNomNouveauClient("");
    }
  }

  async function encaisser() {
    if (panier.length === 0) return;
    if (modePaiement === "mobile_money" && !operateur) {
      setErreur("Choisissez l'opérateur Mobile Money : Orange Money, MTN MoMo, Moov Money ou Wave.");
      bipErreur();
      return;
    }
    setErreur(null);
    setEnCours(true);
    setPointsGagnes(null);
    setDernierTicket(null);

    try {
      const magasinId = profilCaisse?.magasin_id;
      if (!magasinId) {
        throw new Error(
          "Profil caissier introuvable. Connectez-vous au moins une fois avec internet sur ce poste."
        );
      }

      // Identifiant créé sur le poste : si la même vente est envoyée deux fois
      // (connexion coupée pendant l'envoi), la base ne l'enregistre qu'une fois.
      const venteId = nouvelIdentifiant();
      const lignes = panier.map((l) => ({
        produit_id: l.produit.id,
        quantite: l.quantite,
        prix_unitaire: l.produit.prix_vente,
      }));

      let horsLigne = !navigator.onLine;
      const reference = referencePaiement.trim();
      const paiementMobile =
        modePaiement === "mobile_money" && operateur
          ? { p_operateur_mobile: operateur, ...(reference ? { p_reference_paiement: reference } : {}) }
          : {};

      if (!horsLigne) {
        // En ligne : vente atomique avec contrôle du stock, comme avant.
        const { error: erreurVente } = await supabase.rpc("creer_vente", {
          p_magasin_id: magasinId,
          p_mode_paiement: modePaiement,
          p_lignes: lignes,
          p_vente_id: venteId,
          ...paiementMobile,
        });
        if (erreurVente) {
          if (estErreurReseau(erreurVente)) {
            horsLigne = true; // coupure pendant l'envoi : on bascule en file d'attente
          } else {
            throw new Error(erreurVente.message || "Stock insuffisant sur un article.");
          }
        }
      }

      if (horsLigne) {
        // Hors ligne : la vente est gardée sur le poste et partira au retour d'internet.
        ajouterAFile({
          id: venteId,
          magasin_id: magasinId,
          mode_paiement: modePaiement,
          lignes,
          date: new Date().toISOString(),
          total,
          ...(modePaiement === "mobile_money" && operateur
            ? { operateur_mobile: operateur, ...(reference ? { reference_paiement: reference } : {}) }
            : {}),
        });
        setFileAttente(lireFile());
        setEnLigne(false);
      }

      // Fidélité : uniquement en ligne (impossible de vérifier un client sans
      // connexion). Une erreur ici n'annule pas la vente déjà validée.
      let clientSurTicket: TicketRecu["client"] = null;

      if (!horsLigne && clientTrouve) {
        const soldeAvant = clientTrouve.points_cumules;
        const { error: erreurFidelite } = await supabase.rpc("attribuer_points_fidelite", {
          p_vente_id: venteId,
          p_client_id: clientTrouve.id,
        });
        if (!erreurFidelite) {
          const { data: clientMaj } = await supabase
            .from("clients")
            .select("points_cumules")
            .eq("id", clientTrouve.id)
            .single();
          if (clientMaj) {
            const gagnes = clientMaj.points_cumules - soldeAvant;
            setPointsGagnes(gagnes);
            clientSurTicket = {
              nom: clientTrouve.nom,
              pointsGagnes: gagnes,
              soldePoints: clientMaj.points_cumules,
            };
          }
        }
      }

      // Instantané pour le reçu, pris AVANT de vider le panier.
      const recu = modePaiement === "especes" && montantRecu !== "" ? Number(montantRecu) : null;
      setDernierTicket({
        venteId,
        date: new Date(),
        lignes: panier.map((l) => ({
          nom: l.produit.nom,
          quantite: l.quantite,
          prixUnitaire: l.produit.prix_vente,
        })),
        total,
        modePaiement: MODES_PAIEMENT.find((m) => m.valeur === modePaiement)?.libelle ?? modePaiement,
        operateur: modePaiement === "mobile_money" ? libelleOperateur(operateur) : null,
        referencePaiement: modePaiement === "mobile_money" && reference ? reference : null,
        montantRecu: recu,
        monnaie: recu !== null ? Math.max(0, recu - total) : null,
        client: clientSurTicket,
        horsLigne,
      });

      setDerniereVenteTotal(total);
      setPanier([]);
      setMontantRecu("");
      setOperateur(null);
      setReferencePaiement("");
      setClientTrouve(null);
      setTelephoneClient("");
      setRechercheClientFaite(false);
      setFideliteOuverte(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setEnCours(false);
      champScanRef.current?.focus();
    }
  }

  // --- Raccourcis clavier ----------------------------------------------------
  // La fonction est relue à chaque appui (référence), pour toujours voir le
  // ticket et le mode de paiement à jour.
  const raccourcisRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    raccourcisRef.current = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const dansChamp = !!cible && ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName);
      const dansScan = cible === champScanRef.current;

      const mode = { F1: "especes", F2: "mobile_money", F3: "carte" } as const;
      if (e.key in mode) {
        e.preventDefault();
        setModePaiement(mode[e.key as keyof typeof mode]);
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        setModePaiement("especes");
        // Champ déjà affiché : curseur placé tout de suite (on peut taper aussitôt)
        if (champMontantRef.current) champMontantRef.current.focus();
        else requestAnimationFrame(() => champMontantRef.current?.focus());
        return;
      }
      if (e.key === "F12") {
        e.preventDefault();
        if (panier.length > 0 && !enCours) void encaisser();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (multiplicateur !== null || alerteScan || recherche) {
          setMultiplicateur(null);
          setAlerteScan(null);
          setRecherche("");
        } else if (panier.length > 0 && window.confirm("Annuler le ticket en cours ? Tous les articles seront retirés.")) {
          viderTicket();
        }
        champScanRef.current?.focus();
        return;
      }
      // + / − : seulement quand la barre de scan est vide (sinon on tape du texte)
      if ((e.key === "+" || e.key === "-") && (!dansChamp || (dansScan && recherche === ""))) {
        e.preventDefault();
        ajusterDerniereLigne(e.key === "+" ? 1 : -1);
        return;
      }
      // Un caractère tapé (ou scanné) ailleurs que dans un champ part dans la barre de scan
      if (!dansChamp && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        champScanRef.current?.focus();
      }
    };
  });
  useEffect(() => {
    const ecouter = (e: KeyboardEvent) => raccourcisRef.current(e);
    window.addEventListener("keydown", ecouter);
    return () => window.removeEventListener("keydown", ecouter);
  }, []);

  return (
    <>
    {/* Format d'impression : ticket thermique 80 mm, sans marges navigateur.
        Sur une imprimante A4 classique, le ticket s'imprime en haut de page. */}
    <style>{`
      @media print {
        @page { size: 80mm auto; margin: 0; }
        html, body { background: white !important; }
      }
    `}</style>

    <main className="min-h-dvh pb-24 md:pb-0 md:h-dvh md:overflow-hidden flex flex-col print:hidden" style={{ background: "var(--couleur-fond)" }}>
      {/* En-tête */}
      <header
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 md:px-6 py-3"
        style={{ background: "var(--couleur-marque)" }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <Logo surFonce suffixe="Caisse" />
          {infosMagasin && (
            <p className="hidden lg:block text-sm truncate" style={{ color: "var(--couleur-sur-marque-2)" }}>
              {infosMagasin.nomMagasin}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span
            role="status"
            className="inline-flex items-center gap-2 h-8 px-3 rounded-full font-semibold"
            style={{
              background: enLigne ? "var(--couleur-marque-claire)" : "#FEF3C7",
              color: enLigne ? "#FFFFFF" : "#7A4B05",
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: enLigne ? "#6FE0A6" : "#B45309" }} />
            {enLigne ? "En ligne" : "Hors ligne"}
          </span>
          <p className="hidden md:block px-1.5" style={{ color: "var(--couleur-sur-marque)" }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          {infosMagasin?.nomCaissier && (
            <span
              className="hidden sm:inline-flex items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full font-semibold text-white"
              style={{ background: "var(--couleur-marque-claire)" }}
            >
              <span
                aria-hidden
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "var(--couleur-menthe)", color: "var(--couleur-marque)" }}
              >
                {infosMagasin.nomCaissier
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((m) => m[0]?.toUpperCase())
                  .join("")}
              </span>
              {infosMagasin.nomCaissier}
            </span>
          )}
          <BoutonRafraichir
            className="h-10 px-3 rounded-[10px] border font-medium"
            couleur="#FFFFFF"
            confirmation={() =>
              panier.length > 0
                ? "Un ticket est en cours : les articles scannés seront perdus. Actualiser quand même ?"
                : null
            }
          />
          {roleUtilisateur && roleUtilisateur !== "caissier" && (
            <Link
              href="/gerant"
              className="inline-flex items-center h-10 px-4 rounded-[10px] font-semibold"
              style={{ background: "#FFFFFF", color: "var(--couleur-marque)" }}
            >
              Gestion
            </Link>
          )}
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            className="inline-flex items-center gap-2 h-10 px-3 rounded-[10px] font-medium"
            style={{ color: "var(--couleur-sur-marque)" }}
          >
            <Icone nom="sortie" taille={18} />
            Déconnexion
          </button>
        </div>
      </header>

      {/* État de la connexion et des ventes en attente */}
      {!enLigne && (
        <div
          role="status"
          className="px-6 py-2.5 text-sm font-medium"
          style={{ background: "#FEF3C7", color: "#7A4B05", borderBottom: "1px solid #F5D48A" }}
        >
          Mode hors ligne : vous pouvez continuer à encaisser. Les ventes sont gardées sur ce poste
          et seront envoyées dès le retour de la connexion.
          {fileAttente.length > 0 && ` ${fileAttente.length} vente(s) en attente.`}
        </div>
      )}
      {enLigne && fileAttente.length > 0 && (
        <div
          role="status"
          className="px-6 py-2.5 text-sm flex items-center justify-between gap-3"
          style={{ background: "#FEF3C7", color: "#7A4B05", borderBottom: "1px solid #F5D48A" }}
        >
          <span>
            {synchroEnCours
              ? `Envoi de ${fileAttente.length} vente(s) faite(s) hors ligne…`
              : fileAttente.some((v) => v.derniereErreur)
                ? `${fileAttente.length} vente(s) hors ligne non envoyée(s). Dernière erreur : ${
                    fileAttente.find((v) => v.derniereErreur)?.derniereErreur
                  }`
                : `${fileAttente.length} vente(s) hors ligne en attente d'envoi.`}
          </span>
          {!synchroEnCours && (
            <button onClick={synchroniser} className="shrink-0 underline font-semibold">
              Envoyer maintenant
            </button>
          )}
        </div>
      )}

      <div className="flex-1 md:min-h-0 grid grid-cols-1 md:grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_380px] lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Recherche / scan produit */}
        <section className="p-4 md:p-6 flex flex-col gap-5 min-w-0 md:min-h-0 md:overflow-y-auto">
          <label
            className="flex items-center gap-3.5 h-16 px-5 rounded-[14px] border-2 bg-white focus-within:shadow-[0_0_0_4px_var(--couleur-menthe)]"
            style={{ borderColor: "var(--couleur-marque)" }}
          >
            <span style={{ color: "var(--couleur-marque)" }}>
              <Icone nom="codeBarre" taille={26} />
            </span>
            <span className="sr-only">Scanner ou rechercher un article</span>
            {multiplicateur !== null && (
              <button
                type="button"
                onClick={() => setMultiplicateur(null)}
                title="Retirer la quantité"
                className="shrink-0 inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-full text-[15px] font-bold text-white"
                style={{ background: "var(--couleur-marque)" }}
              >
                × {formateurQuantite.format(multiplicateur)}
                <Icone nom="fermer" taille={14} />
              </button>
            )}
            <input
              ref={champScanRef}
              autoFocus
              value={recherche}
              onChange={(e) => changerRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void validerSaisie();
                }
              }}
              placeholder={
                multiplicateur !== null
                  ? "Scannez l'article à ajouter en plusieurs exemplaires…"
                  : "Scannez un code-barres ou tapez le nom d'un article…"
              }
              autoComplete="off"
              spellCheck={false}
              className="champ-nu flex-1 min-w-0 bg-transparent text-lg md:text-xl outline-none"
            />
          </label>

          {alerteScan && (
            <p
              role="alert"
              className="-mt-2 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[15px] font-semibold"
              style={{ background: "#FDE3E1", color: "#9B1C14" }}
            >
              <Icone nom="fermer" taille={18} />
              {alerteScan}
            </p>
          )}

          <ul className="hidden md:flex flex-wrap items-center gap-x-4 gap-y-2 -mt-2 text-[13px]" style={{ color: "var(--couleur-texte-2)" }} aria-label="Raccourcis clavier">
            {AIDE_RACCOURCIS.map(([touche, action]) => (
              <li key={touche} className="inline-flex items-center gap-1.5">
                <Touche>{touche}</Touche>
                {action}
              </li>
            ))}
          </ul>

          {resultats.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold" style={{ color: "var(--couleur-texte-2)" }}>
                {resultats.length} article{resultats.length > 1 ? "s" : ""} trouvé{resultats.length > 1 ? "s" : ""}
              </h2>
              <TuilesArticles produits={resultats} onChoisir={ajouterAuPanier} surligne={resultats[0]?.id} />
            </div>
          )}

          {resultats.length === 0 && recents.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold" style={{ color: "var(--couleur-texte-2)" }}>
                Ajoutés récemment
              </h2>
              <TuilesArticles produits={recents} onChoisir={ajouterAuPanier} />
            </div>
          )}

          {resultats.length === 0 && recents.length === 0 && (
            <div
              className="mt-2 rounded-2xl border border-dashed px-6 py-12 flex flex-col items-center text-center gap-3"
              style={{ borderColor: "var(--couleur-bordure-forte)", color: "var(--couleur-texte-2)" }}
            >
              <span style={{ color: "var(--couleur-marque)" }}>
                <Icone nom="codeBarre" taille={40} />
              </span>
              <p className="police-titre text-xl font-bold" style={{ color: "var(--couleur-texte)" }}>
                Prêt à encaisser
              </p>
              <p className="text-[15px] max-w-sm">
                Scannez le premier article, ou tapez au moins deux lettres de son nom.
              </p>
            </div>
          )}
        </section>

        {/* Ticket en cours */}
        <aside
          className="border-t md:border-t-0 md:border-l flex flex-col min-w-0 md:min-h-0 md:overflow-hidden"
          style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
        >
          <div className="shrink-0 flex items-center justify-between px-5 md:px-6 py-4 [@media(max-height:820px)]:py-2.5 border-b" style={{ borderColor: "var(--couleur-bordure)" }}>
            <div>
              <h2 className="police-titre text-xl font-bold">Ticket en cours</h2>
              <p className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
                {panier.length === 0 ? "Aucun article" : `${panier.length} article${panier.length > 1 ? "s" : ""}`}
              </p>
            </div>
            {panier.length > 0 && (
              <button
                onClick={viderTicket}
                className="h-10 px-3 text-sm font-semibold rounded-[10px]"
                style={{ color: "var(--couleur-danger)" }}
              >
                Vider
              </button>
            )}
          </div>

          <div className="flex-1 md:basis-0 md:min-h-[110px] md:overflow-y-auto px-5 md:px-6 py-1 flex flex-col">
            {panier.length === 0 && (
              <p className="py-12 [@media(max-height:820px)]:py-6 text-center text-[15px]" style={{ color: "var(--couleur-texte-2)" }}>
                Le ticket est vide.
              </p>
            )}
            {panier.map((l) => (
              <div
                key={derniereLigne?.id === l.produit.id ? `${l.produit.id}-${derniereLigne.n}` : l.produit.id}
                id={`ligne-${l.produit.id}`}
                className={`flex flex-col gap-1.5 py-3 -mx-3 px-3 rounded-lg border-b ${
                  derniereLigne?.id === l.produit.id ? "flash-ajout" : ""
                }`}
                style={{ borderColor: "var(--couleur-ligne)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-semibold leading-snug">{l.produit.nom}</p>
                  <span className="text-[15px] font-bold whitespace-nowrap">
                    {formateurFCFA.format(l.quantite * l.produit.prix_vente)} F
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
                    {formateurFCFA.format(l.produit.prix_vente)} F {l.produit.est_pese ? "le kg" : "l’unité"}
                  </p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      aria-label={`Retirer un ${l.produit.nom}`}
                      onClick={() => modifierQuantite(l.produit.id, l.quantite - 1)}
                      className="w-9 h-9 rounded-full border flex items-center justify-center text-lg"
                      style={{ borderColor: "var(--couleur-bordure)" }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={l.produit.est_pese ? "0.001" : "1"}
                      inputMode="decimal"
                      aria-label={`Quantité de ${l.produit.nom}`}
                      value={quantiteSaisie[l.produit.id] ?? String(l.quantite)}
                      onChange={(e) =>
                        setQuantiteSaisie((actuel) => ({ ...actuel, [l.produit.id]: e.target.value }))
                      }
                      onBlur={(e) => {
                        const valeur = Number(e.target.value);
                        modifierQuantite(l.produit.id, Number.isFinite(valeur) ? valeur : l.quantite);
                        setQuantiteSaisie((actuel) => {
                          const copie = { ...actuel };
                          delete copie[l.produit.id];
                          return copie;
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="w-14 h-9 text-center text-[15px] font-bold rounded-lg border-0 bg-transparent focus:bg-[var(--couleur-menthe)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      aria-label={`Ajouter un ${l.produit.nom}`}
                      onClick={() => modifierQuantite(l.produit.id, l.quantite + 1)}
                      className="w-9 h-9 rounded-full border flex items-center justify-center text-lg"
                      style={{ borderColor: "var(--couleur-bordure)" }}
                    >
                      +
                    </button>
                    <button
                      aria-label={`Supprimer ${l.produit.nom} du ticket`}
                      onClick={() => supprimerLigne(l.produit.id)}
                      className="w-9 h-9 ml-1 flex items-center justify-center rounded-full"
                      style={{ color: "var(--couleur-danger)" }}
                    >
                      <Icone nom="fermer" taille={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paiement — toujours visible : le bouton Encaisser reste en bas de l'écran,
              seule la liste des articles défile quand le ticket est long. */}
          <div
            className="shrink-0 md:shrink md:min-h-0 flex flex-col border-t"
            style={{ borderColor: "var(--couleur-bordure)", background: "#FAFBF9" }}
          >
          <div className="md:min-h-0 md:overflow-y-auto px-5 md:px-6 pt-4 pb-3 [@media(max-height:820px)]:pt-2.5 [@media(max-height:820px)]:pb-2 flex flex-col gap-3.5 [@media(max-height:820px)]:gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-semibold" style={{ color: "var(--couleur-texte-2)" }}>
                Total à payer
              </span>
              <span className="police-titre text-[40px] [@media(max-height:820px)]:text-[32px] leading-none font-bold tracking-tight" style={{ color: "var(--couleur-marque)" }}>
                {formateurFCFA.format(total)} F
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {MODES_PAIEMENT.map((m) => {
                const actif = modePaiement === m.valeur;
                return (
                  <button
                    key={m.valeur}
                    onClick={() => setModePaiement(m.valeur)}
                    aria-pressed={actif}
                    className="h-12 md:h-14 [@media(max-height:820px)]:md:h-11 rounded-[10px] text-[15px] font-semibold border-2 transition-colors"
                    style={{
                      borderColor: actif ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                      background: actif ? "var(--couleur-menthe)" : "#FFFFFF",
                      color: "var(--couleur-marque)",
                    }}
                  >
                    <span className="flex flex-col items-center leading-tight">
                      {m.libelle}
                      <span className="hidden md:block [@media(max-height:820px)]:md:hidden text-[11px] font-bold opacity-60">{m.touche}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {modePaiement === "especes" && (
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--couleur-texte-2)" }}>
                    Montant reçu <span className="hidden md:inline-flex align-middle ml-1"><Touche>F4</Touche></span>
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    ref={champMontantRef}
                    value={montantRecu}
                    onChange={(e) => setMontantRecu(e.target.value)}
                    onKeyDown={(e) => {
                      // Montant tapé puis Entrée : on encaisse directement
                      if (e.key === "Enter" && panier.length > 0 && !enCours) {
                        e.preventDefault();
                        void encaisser();
                      }
                    }}
                    placeholder="0"
                    className="champ w-36 h-11 [@media(max-height:820px)]:h-10 text-right text-lg font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </label>
                {total > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {montantsProposes(total).map((m, i) => {
                      const actif = montantRecu === String(m);
                      return (
                        <button
                          key={m}
                          onClick={() => setMontantRecu(String(m))}
                          aria-pressed={actif}
                          className="h-11 [@media(max-height:820px)]:h-10 rounded-[10px] text-sm font-semibold border transition-colors"
                          style={{
                            borderColor: actif ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                            background: actif ? "var(--couleur-marque)" : "#FFFFFF",
                            color: actif ? "#FFFFFF" : "var(--couleur-texte)",
                          }}
                        >
                          {i === 0 ? "Exact" : formateurFCFA.format(m)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {monnaieARendre !== null && (
                  <div
                    className="flex items-center justify-between rounded-[10px] px-3.5 py-2.5 [@media(max-height:820px)]:py-1.5"
                    style={{
                      background: Number(montantRecu) < total ? "#FEF3C7" : "var(--couleur-menthe)",
                    }}
                  >
                    <span
                      className="text-[15px] font-semibold"
                      style={{ color: Number(montantRecu) < total ? "#7A4B05" : "var(--couleur-marque-claire)" }}
                    >
                      {Number(montantRecu) < total ? "Montant insuffisant" : "Monnaie à rendre"}
                    </span>
                    <span className="police-titre text-2xl font-bold" style={{ color: "var(--couleur-marque)" }}>
                      {Number(montantRecu) < total
                        ? `− ${formateurFCFA.format(total - Number(montantRecu))} F`
                        : `${formateurFCFA.format(monnaieARendre)} F`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {modePaiement === "mobile_money" && (
              <div className="flex flex-col gap-2" role="group" aria-label="Opérateur Mobile Money">
                <span className="text-[13px] font-semibold" style={{ color: "var(--couleur-texte-2)" }}>
                  Opérateur
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {OPERATEURS_MOBILE.map((o) => {
                    const actif = operateur === o.valeur;
                    return (
                      <button
                        key={o.valeur}
                        type="button"
                        onClick={() => {
                          setOperateur(o.valeur);
                          setErreur(null);
                        }}
                        aria-pressed={actif}
                        className="h-11 [@media(max-height:820px)]:h-10 px-3 rounded-[10px] text-[15px] font-semibold border-2 flex items-center gap-2.5 transition-colors"
                        style={{
                          borderColor: actif ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                          background: actif ? "var(--couleur-menthe)" : "#FFFFFF",
                          color: "var(--couleur-texte)",
                        }}
                      >
                        <span
                          aria-hidden
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ background: o.couleur, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
                        />
                        {o.libelle}
                      </button>
                    );
                  })}
                </div>
                <input
                  value={referencePaiement}
                  onChange={(e) => setReferencePaiement(e.target.value.slice(0, 60))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && panier.length > 0 && !enCours) {
                      e.preventDefault();
                      void encaisser();
                    }
                  }}
                  placeholder="Référence de la transaction (facultatif)"
                  aria-label="Référence de la transaction Mobile Money"
                  autoComplete="off"
                  spellCheck={false}
                  className="champ h-11 [@media(max-height:820px)]:h-10 text-sm"
                />
              </div>
            )}

            {/* Fidélité — optionnel, et uniquement en ligne */}
            {!enLigne ? (
              <p className="text-[13px]" style={{ color: "var(--couleur-texte-3)" }}>
                Fidélité indisponible hors ligne : les points ne peuvent pas être attribués pendant la coupure.
              </p>
            ) : !clientTrouve && !fideliteOuverte ? (
              <button
                type="button"
                onClick={() => setFideliteOuverte(true)}
                className="self-start inline-flex items-center gap-1.5 h-9 text-sm font-semibold"
                style={{ color: "var(--couleur-marque)" }}
              >
                <Icone nom="plus" taille={16} />
                Client fidélité
              </button>
            ) : !clientTrouve ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="Téléphone client fidélité (optionnel)"
                    aria-label="Téléphone du client fidélité"
                    value={telephoneClient}
                    onChange={(e) => {
                      setTelephoneClient(e.target.value);
                      setRechercheClientFaite(false);
                    }}
                    autoFocus
                    className="champ flex-1 min-w-0 h-11 text-sm"
                  />
                  <button onClick={chercherClient} className="bouton bouton-secondaire h-11 px-3.5 text-sm">
                    Chercher
                  </button>
                  <button
                    type="button"
                    aria-label="Fermer la fidélité"
                    onClick={() => {
                      setFideliteOuverte(false);
                      setTelephoneClient("");
                      setRechercheClientFaite(false);
                    }}
                    className="w-9 h-11 flex items-center justify-center shrink-0"
                    style={{ color: "var(--couleur-texte-2)" }}
                  >
                    <Icone nom="fermer" taille={16} />
                  </button>
                </div>
                {rechercheClientFaite && !clientTrouve && (
                  <div className="flex gap-2">
                    <input
                      placeholder="Nom du nouveau client"
                      aria-label="Nom du nouveau client"
                      value={nomNouveauClient}
                      onChange={(e) => setNomNouveauClient(e.target.value)}
                      className="champ flex-1 min-w-0 h-11 text-sm"
                    />
                    <button onClick={creerClient} className="bouton bouton-principal h-11 px-3.5 text-sm">
                      Créer
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="flex items-center justify-between text-sm rounded-[10px] px-3.5 py-2.5"
                style={{ background: "var(--couleur-ligne)" }}
              >
                <span>
                  <span className="font-semibold">{clientTrouve.nom}</span> · {clientTrouve.points_cumules} points
                </span>
                <button
                  onClick={() => {
                    setClientTrouve(null);
                    setTelephoneClient("");
                    setRechercheClientFaite(false);
                  }}
                  className="font-semibold"
                  style={{ color: "var(--couleur-danger)" }}
                >
                  Retirer
                </button>
              </div>
            )}

            {erreur && (
              <p role="alert" className="text-sm rounded-[10px] px-3.5 py-2.5" style={{ background: "#FDE3E1", color: "var(--couleur-danger)" }}>
                {erreur}
              </p>
            )}

            {derniereVenteTotal !== null && !erreur && (
              <div
                className="flex items-center justify-between gap-3 text-sm rounded-[10px] px-3.5 py-2.5"
                style={{ background: "#E3F3EA", color: "var(--couleur-succes)" }}
              >
                <span className="font-medium">
                  {dernierTicket?.horsLigne ? "Vente gardée sur le poste" : "Vente encaissée"} — {formateurFCFA.format(derniereVenteTotal)} F
                  {pointsGagnes !== null && pointsGagnes > 0 && ` · +${pointsGagnes} points fidélité`}
                </span>
                {dernierTicket && (
                  <button onClick={() => window.print()} className="bouton bouton-principal shrink-0 min-h-0 h-9 px-3 text-sm">
                    Réimprimer
                  </button>
                )}
              </div>
            )}

          </div>

          <div
            className="shrink-0 fixed md:sticky bottom-0 inset-x-0 z-20 md:z-auto border-t md:border-t-0 px-5 md:px-6 pt-2 pb-4 [@media(max-height:820px)]:pb-3"
            style={{ background: "#FAFBF9", borderColor: "var(--couleur-bordure)" }}
          >
            <button
              onClick={encaisser}
              disabled={panier.length === 0 || enCours}
              className="bouton bouton-accent w-full h-16 [@media(max-height:820px)]:h-14 rounded-[14px] police-titre text-[22px] [@media(max-height:820px)]:text-xl font-bold"
            >
              {enCours ? "Encaissement…" : panier.length > 0 ? `Encaisser ${formateurFCFA.format(total)} F` : "Encaisser"}
              <span className="hidden md:inline-flex ml-1">
                <Touche claire>F12</Touche>
              </span>
            </button>
          </div>
          </div>
        </aside>
      </div>
    </main>

    {/* Reçu — invisible à l'écran, seul élément imprimé */}
    {dernierTicket && (
      <div
        className="hidden print:block"
        style={{
          width: "72mm",
          padding: "4mm",
          fontFamily: "'Courier New', ui-monospace, monospace",
          fontSize: "11px",
          lineHeight: 1.4,
          color: "#000",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "6px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>{infosMagasin?.nomMagasin ?? "SOURA Marché"}</div>
          {infosMagasin?.adresse && <div>{infosMagasin.adresse}</div>}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        <div>
          Le {dernierTicket.date.toLocaleDateString("fr-FR")} à{" "}
          {dernierTicket.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div>Ticket n° {dernierTicket.venteId.slice(0, 8).toUpperCase()}</div>
        {infosMagasin?.nomCaissier && <div>Caissier : {infosMagasin.nomCaissier}</div>}

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        {dernierTicket.lignes.map((l, i) => (
          <div key={i} style={{ marginBottom: "3px" }}>
            <div>{l.nom}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                {l.quantite} × {formateurFCFA.format(l.prixUnitaire)}
              </span>
              <span>{formateurFCFA.format(l.quantite * l.prixUnitaire)} F</span>
            </div>
          </div>
        ))}

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: 700 }}>
          <span>TOTAL</span>
          <span>{formateurFCFA.format(dernierTicket.total)} F</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Paiement</span>
          <span>{dernierTicket.operateur ? `${dernierTicket.modePaiement} (${dernierTicket.operateur})` : dernierTicket.modePaiement}</span>
        </div>
        {dernierTicket.referencePaiement && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
            <span>Réf.</span>
            <span style={{ wordBreak: "break-all", textAlign: "right" }}>{dernierTicket.referencePaiement}</span>
          </div>
        )}
        {dernierTicket.montantRecu !== null && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Reçu</span>
              <span>{formateurFCFA.format(dernierTicket.montantRecu)} F</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Monnaie rendue</span>
              <span>{formateurFCFA.format(dernierTicket.monnaie ?? 0)} F</span>
            </div>
          </>
        )}

        {dernierTicket.client && (
          <>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div>Client : {dernierTicket.client.nom}</div>
            <div>Points gagnés : +{dernierTicket.client.pointsGagnes}</div>
            <div>Solde fidélité : {dernierTicket.client.soldePoints} points</div>
          </>
        )}

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div style={{ textAlign: "center" }}>Merci de votre visite !</div>
      </div>
    )}
    </>
  );
}
