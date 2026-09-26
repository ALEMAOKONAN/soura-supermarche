"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import VersionApp from "@/components/VersionApp";
import BoutonRafraichir from "@/components/BoutonRafraichir";
import {
  ajouterAFile,
  chercherDansCatalogue,
  enregistrerCatalogue,
  enregistrerProfil,
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
  montantRecu: number | null;
  monnaie: number | null;
  client: { nom: string; pointsGagnes: number; soldePoints: number } | null;
  horsLigne: boolean;
};

type InfosMagasin = { nomMagasin: string; adresse: string; nomCaissier: string };

const MODES_PAIEMENT = [
  { valeur: "especes", libelle: "Espèces" },
  { valeur: "carte", libelle: "Carte" },
  { valeur: "mobile_money", libelle: "Mobile Money" },
] as const;

const formateurFCFA = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export default function PageCaisse() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<Produit[]>([]);
  const [panier, setPanier] = useState<LignePanier[]>([]);
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

    async function chargerProfil() {
      try {
        const { data: authData, error: erreurAuth } = await supabase.auth.getUser();
        if (erreurAuth) throw erreurAuth;
        if (!authData.user) return;
        const { data: profil, error } = await supabase
          .from("utilisateurs")
          .select("role, organisation_id, magasin_id, nom_complet, magasins(nom, adresse, ville)")
          .eq("id", authData.user.id)
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
        rafraichirCatalogue();
      } catch {
        // Pas de connexion : on travaille avec le profil mémorisé sur le poste.
        const memorise = lireProfil();
        if (memorise) appliquerProfil(memorise);
      }
    }
    chargerProfil();

    // Catalogue remis à jour toutes les 10 minutes tant que la connexion tient.
    const intervalleCatalogue = setInterval(() => {
      if (navigator.onLine) rafraichirCatalogue();
    }, 10 * 60 * 1000);

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

  // Recherche produit (nom ou code-barre) — se relance à chaque frappe,
  // avec un léger anti-rebond pour ne pas spammer l'API à chaque touche.
  useEffect(() => {
    if (recherche.trim().length < 2) {
      setResultats([]);
      return;
    }
    const delai = setTimeout(async () => {
      if (!navigator.onLine) {
        setResultats(chercherDansCatalogue(recherche));
        return;
      }
      const { data, error } = await supabase
        .from("produits")
        .select("id, nom, code_barre, unite, prix_vente, est_pese")
        .eq("actif", true)
        .or(`nom.ilike.%${recherche}%,code_barre.eq.${recherche}`)
        .limit(8);
      if (error) {
        // Réseau instable : on bascule sur le catalogue du poste.
        setResultats(chercherDansCatalogue(recherche));
        if (estErreurReseau(error)) setEnLigne(false);
        return;
      }
      setResultats(data ?? []);
    }, 200);
    return () => clearTimeout(delai);
  }, [recherche, supabase]);

  function ajouterAuPanier(produit: Produit) {
    setPanier((actuel) => {
      const existant = actuel.find((l) => l.produit.id === produit.id);
      if (existant) {
        return actuel.map((l) =>
          l.produit.id === produit.id ? { ...l, quantite: l.quantite + 1 } : l
        );
      }
      return [...actuel, { produit, quantite: 1 }];
    });
    setRecherche("");
    setResultats([]);
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
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data: profil } = await supabase
      .from("utilisateurs")
      .select("organisation_id")
      .eq("id", authData.user.id)
      .single();
    if (!profil) return;

    const { data, error } = await supabase
      .from("clients")
      .insert({ organisation_id: profil.organisation_id, nom: nomNouveauClient.trim(), telephone: telephoneClient.trim() })
      .select("id, nom, points_cumules")
      .single();

    if (!error && data) {
      setClientTrouve(data);
      setNomNouveauClient("");
    }
  }

  async function encaisser() {
    if (panier.length === 0) return;
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

      if (!horsLigne) {
        // En ligne : vente atomique avec contrôle du stock, comme avant.
        const { error: erreurVente } = await supabase.rpc("creer_vente", {
          p_magasin_id: magasinId,
          p_mode_paiement: modePaiement,
          p_lignes: lignes,
          p_vente_id: venteId,
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
        montantRecu: recu,
        monnaie: recu !== null ? Math.max(0, recu - total) : null,
        client: clientSurTicket,
        horsLigne,
      });

      setDerniereVenteTotal(total);
      setPanier([]);
      setMontantRecu("");
      setClientTrouve(null);
      setTelephoneClient("");
      setRechercheClientFaite(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inattendue.");
    } finally {
      setEnCours(false);
    }
  }

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

    <main className="min-h-screen flex flex-col print:hidden" style={{ background: "var(--couleur-fond)" }}>
      {/* En-tête */}
      <header
        className="flex items-center justify-between px-6 h-16 border-b"
        style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
      >
        <p className="police-titre font-semibold" style={{ color: "var(--couleur-marque)" }}>
          SOURA Marché · Caisse
        </p>
        <div className="flex items-center gap-5 text-sm">
          <p style={{ color: "#6B6858" }}>
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <BoutonRafraichir
            confirmation={() =>
              panier.length > 0
                ? "Un ticket est en cours : les articles scannés seront perdus. Actualiser quand même ?"
                : null
            }
          />
          {roleUtilisateur && roleUtilisateur !== "caissier" && (
            <a href="/gerant" style={{ color: "var(--couleur-marque)" }}>
              Gestion →
            </a>
          )}
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            style={{ color: "var(--couleur-marque)" }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* État de la connexion et des ventes en attente */}
      {!enLigne && (
        <div
          role="status"
          className="px-6 py-2 text-sm font-medium"
          style={{ background: "#FFF4EC", color: "var(--couleur-accent-sombre)", borderBottom: "1px solid #F0C9A8" }}
        >
          Mode hors ligne : vous pouvez continuer à encaisser. Les ventes sont gardées sur ce poste
          et seront envoyées dès le retour de la connexion.
          {fileAttente.length > 0 && ` ${fileAttente.length} vente(s) en attente.`}
        </div>
      )}
      {enLigne && fileAttente.length > 0 && (
        <div
          role="status"
          className="px-6 py-2 text-sm flex items-center justify-between gap-3"
          style={{ background: "#FFF4EC", color: "var(--couleur-accent-sombre)", borderBottom: "1px solid #F0C9A8" }}
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
            <button onClick={synchroniser} className="shrink-0 underline font-medium">
              Envoyer maintenant
            </button>
          )}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_360px]">
        {/* Recherche / scan produit */}
        <section className="p-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Scanner ou rechercher un article</span>
            <input
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom de l'article ou code-barres…"
              className="h-14 px-4 rounded-md border bg-white text-lg outline-none focus:border-[var(--couleur-marque)]"
              style={{ borderColor: "var(--couleur-bordure)" }}
            />
          </label>

          {resultats.length > 0 && (
            <ul className="flex flex-col rounded-md border overflow-hidden" style={{ borderColor: "var(--couleur-bordure)" }}>
              {resultats.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => ajouterAuPanier(p)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F0EEE7] transition-colors border-b last:border-b-0"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  >
                    <span>
                      <span className="font-medium">{p.nom}</span>
                      {p.est_pese && <span className="text-xs ml-2" style={{ color: "#6B6858" }}>vendu au poids</span>}
                    </span>
                    <span className="police-titre font-semibold">
                      {formateurFCFA.format(p.prix_vente)} F
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {panier.length === 0 && resultats.length === 0 && (
            <p className="text-sm mt-8" style={{ color: "#8A8676" }}>
              Le ticket est vide. Recherchez un article pour commencer.
            </p>
          )}

          <VersionApp className="mt-auto pt-6" />
        </section>

        {/* Ticket en cours */}
        <aside
          className="border-t md:border-t-0 md:border-l flex flex-col"
          style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
        >
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="police-titre font-semibold text-sm uppercase tracking-wide" style={{ color: "#6B6858" }}>
                Ticket en cours
              </h2>
              {panier.length > 0 && (
                <button
                  onClick={viderTicket}
                  className="text-xs"
                  style={{ color: "var(--couleur-danger)" }}
                >
                  Vider le ticket
                </button>
              )}
            </div>

            {panier.map((l) => (
              <div key={l.produit.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{l.produit.nom}</p>
                  <p className="text-xs" style={{ color: "#8A8676" }}>
                    {formateurFCFA.format(l.produit.prix_vente)} F × {l.quantite}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    aria-label={`Retirer un ${l.produit.nom}`}
                    onClick={() => modifierQuantite(l.produit.id, l.quantite - 1)}
                    className="w-9 h-9 rounded-full border flex items-center justify-center"
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
                    className="w-16 h-9 text-center text-sm rounded-md border"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  />
                  <button
                    aria-label={`Ajouter un ${l.produit.nom}`}
                    onClick={() => modifierQuantite(l.produit.id, l.quantite + 1)}
                    className="w-9 h-9 rounded-full border flex items-center justify-center"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  >
                    +
                  </button>
                  <button
                    aria-label={`Supprimer ${l.produit.nom} du ticket`}
                    onClick={() => supprimerLigne(l.produit.id)}
                    className="w-9 h-9 rounded-full flex items-center justify-center ml-1"
                    style={{ color: "var(--couleur-danger)" }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Paiement — toujours visible, jamais à faire défiler pour trouver "encaisser" */}
          <div className="p-5 border-t flex flex-col gap-3" style={{ borderColor: "var(--couleur-bordure)" }}>
            {/* Fidélité — optionnel, et uniquement en ligne */}
            {!enLigne ? (
              <p className="text-xs" style={{ color: "#8A8676" }}>
                Fidélité indisponible hors ligne : les points ne peuvent pas être attribués pendant la coupure.
              </p>
            ) : !clientTrouve ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="Téléphone client (optionnel)"
                    value={telephoneClient}
                    onChange={(e) => {
                      setTelephoneClient(e.target.value);
                      setRechercheClientFaite(false);
                    }}
                    className="flex-1 h-9 px-2 rounded-md border text-sm"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  />
                  <button
                    onClick={chercherClient}
                    className="h-9 px-3 rounded-md text-sm border"
                    style={{ borderColor: "var(--couleur-bordure)" }}
                  >
                    Chercher
                  </button>
                </div>
                {rechercheClientFaite && !clientTrouve && (
                  <div className="flex gap-2">
                    <input
                      placeholder="Nom du nouveau client"
                      value={nomNouveauClient}
                      onChange={(e) => setNomNouveauClient(e.target.value)}
                      className="flex-1 h-9 px-2 rounded-md border text-sm"
                      style={{ borderColor: "var(--couleur-bordure)" }}
                    />
                    <button
                      onClick={creerClient}
                      className="h-9 px-3 rounded-md text-sm text-white"
                      style={{ background: "var(--couleur-marque)" }}
                    >
                      Créer
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm rounded-md px-3 py-2" style={{ background: "#F0EEE7" }}>
                <span>{clientTrouve.nom} — {clientTrouve.points_cumules} points</span>
                <button
                  onClick={() => {
                    setClientTrouve(null);
                    setTelephoneClient("");
                    setRechercheClientFaite(false);
                  }}
                  style={{ color: "var(--couleur-danger)" }}
                >
                  Retirer
                </button>
              </div>
            )}

            <div className="flex gap-2">
              {MODES_PAIEMENT.map((m) => (
                <button
                  key={m.valeur}
                  onClick={() => setModePaiement(m.valeur)}
                  className="flex-1 h-11 rounded-md text-sm font-medium border transition-colors"
                  style={{
                    borderColor: modePaiement === m.valeur ? "var(--couleur-marque)" : "var(--couleur-bordure)",
                    background: modePaiement === m.valeur ? "var(--couleur-marque)" : "transparent",
                    color: modePaiement === m.valeur ? "white" : "var(--couleur-texte)",
                  }}
                >
                  {m.libelle}
                </button>
              ))}
            </div>

            {modePaiement === "especes" && (
              <label className="flex items-center justify-between text-sm">
                <span>Montant reçu</span>
                <input
                  type="number"
                  min={0}
                  value={montantRecu}
                  onChange={(e) => setMontantRecu(e.target.value)}
                  className="w-28 h-9 px-2 rounded-md border text-right"
                  style={{ borderColor: "var(--couleur-bordure)" }}
                />
              </label>
            )}

            {monnaieARendre !== null && (
              <p className="text-sm" style={{ color: "var(--couleur-succes)" }}>
                Monnaie à rendre : {formateurFCFA.format(monnaieARendre)} F
              </p>
            )}

            <div className="flex items-baseline justify-between police-titre">
              <span className="text-sm font-medium" style={{ color: "#6B6858" }}>Total</span>
              <span className="text-3xl font-bold">{formateurFCFA.format(total)} F</span>
            </div>

            {erreur && (
              <p role="alert" className="text-sm rounded-md px-3 py-2" style={{ background: "#FBEAE8", color: "var(--couleur-danger)" }}>
                {erreur}
              </p>
            )}

            {derniereVenteTotal !== null && !erreur && (
              <div
                className="flex items-center justify-between gap-3 text-sm rounded-md px-3 py-2"
                style={{ background: "#E9F5EE", color: "var(--couleur-succes)" }}
              >
                <span>
                  {dernierTicket?.horsLigne ? "Vente gardée sur le poste" : "Vente encaissée"} — {formateurFCFA.format(derniereVenteTotal)} F
                  {pointsGagnes !== null && pointsGagnes > 0 && ` · +${pointsGagnes} points fidélité`}
                </span>
                {dernierTicket && (
                  <button
                    onClick={() => window.print()}
                    className="shrink-0 h-9 px-3 rounded-md text-sm font-medium text-white"
                    style={{ background: "var(--couleur-marque)" }}
                  >
                    Réimprimer
                  </button>
                )}
              </div>
            )}

            <button
              onClick={encaisser}
              disabled={panier.length === 0 || enCours}
              className="h-14 rounded-md text-white text-lg font-semibold disabled:opacity-40 transition-opacity"
              style={{ background: "var(--couleur-accent)" }}
            >
              {enCours ? "Encaissement…" : "Encaisser"}
            </button>
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
          <span>{dernierTicket.modePaiement}</span>
        </div>
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
