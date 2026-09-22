"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";

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
  const [enCours, setEnCours] = useState(false);  const [erreur, setErreur] = useState<string | null>(null);
  const [derniereVenteTotal, setDerniereVenteTotal] = useState<number | null>(null);

  // Fidélité — rattachement d'un client optionnel au moment du paiement
  const [telephoneClient, setTelephoneClient] = useState("");
  const [clientTrouve, setClientTrouve] = useState<Client | null>(null);
  const [rechercheClientFaite, setRechercheClientFaite] = useState(false);
  const [nomNouveauClient, setNomNouveauClient] = useState("");
  const [pointsGagnes, setPointsGagnes] = useState<number | null>(null);

  // Recherche produit (nom ou code-barre) — se relance à chaque frappe,
  // avec un léger anti-rebond pour ne pas spammer l'API à chaque touche.
  useEffect(() => {
    if (recherche.trim().length < 2) {
      setResultats([]);
      return;
    }
    const delai = setTimeout(async () => {
      const { data } = await supabase
        .from("produits")
        .select("id, nom, code_barre, unite, prix_vente, est_pese")
        .eq("actif", true)
        .or(`nom.ilike.%${recherche}%,code_barre.eq.${recherche}`)
        .limit(8);
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

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Session expirée, reconnectez-vous.");

      const { data: profil, error: erreurProfil } = await supabase
        .from("utilisateurs")
        .select("organisation_id, magasin_id")
        .eq("id", authData.user.id)
        .single();
      if (erreurProfil || !profil?.magasin_id) throw new Error("Profil caissier introuvable.");

      // Un seul appel atomique : en-tête + lignes créés dans la même
      // transaction côté base. Si un article a un stock insuffisant, TOUTE
      // la vente est annulée — jamais d'en-tête de vente "fantôme" à 0 F.
      const { data: venteId, error: erreurVente } = await supabase.rpc("creer_vente", {
        p_magasin_id: profil.magasin_id,
        p_mode_paiement: modePaiement,
        p_lignes: panier.map((l) => ({
          produit_id: l.produit.id,
          quantite: l.quantite,
          prix_unitaire: l.produit.prix_vente,
        })),
      });
      if (erreurVente) throw new Error(erreurVente.message || "Stock insuffisant sur un article.");

      // Fidélité : rattachement du client + calcul des points, uniquement
      // si un client a été sélectionné avant l'encaissement. Une erreur ici
      // n'annule pas la vente déjà validée — elle est juste signalée.
      if (clientTrouve && venteId) {
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
          if (clientMaj) setPointsGagnes(clientMaj.points_cumules - soldeAvant);
        }
      }

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
    <main className="min-h-screen flex flex-col" style={{ background: "var(--couleur-fond)" }}>
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
            {/* Fidélité — optionnel */}
            {!clientTrouve ? (
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
              <p className="text-sm rounded-md px-3 py-2" style={{ background: "#E9F5EE", color: "var(--couleur-succes)" }}>
                Vente encaissée — {formateurFCFA.format(derniereVenteTotal)} F
                {pointsGagnes !== null && pointsGagnes > 0 && ` · +${pointsGagnes} points fidélité`}
              </p>
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
  );
}
