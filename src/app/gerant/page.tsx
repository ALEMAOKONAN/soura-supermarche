"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";

type LigneCA = { jour: string; nombre_ventes: number; chiffre_affaires: number };
type LigneMeilleureVente = { produit_id: string; nom: string; quantite_vendue: number; chiffre_affaires: number };
type LigneValeurStock = { magasin_id: string; valeur_totale_achat: number; valeur_totale_vente: number };
type LigneRotationLente = { produit_id: string; nom: string; quantite_stock: number; derniere_vente: string | null };
type LigneReappro = { produit_id: string; nom: string; quantite: number; seuil_reappro: number };

const formateurFCFA = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const AUJOURDHUI = new Date().toISOString().slice(0, 10);

export default function PageGerant() {
  const supabase = useMemo(() => creerClientSupabase(), []);

  const [chargement, setChargement] = useState(true);
  const [accesRefuse, setAccesRefuse] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ca, setCa] = useState<LigneCA[]>([]);
  const [meilleuresVentes, setMeilleuresVentes] = useState<LigneMeilleureVente[]>([]);
  const [valeurStock, setValeurStock] = useState<LigneValeurStock | null>(null);
  const [rotationLente, setRotationLente] = useState<LigneRotationLente[]>([]);
  const [aReapprovisionner, setAReapprovisionner] = useState<LigneReappro[]>([]);

  useEffect(() => {
    async function charger() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        window.location.href = "/";
        return;
      }

      const { data: profil, error: erreurProfil } = await supabase
        .from("utilisateurs")
        .select("role, magasin_id")
        .eq("id", authData.user.id)
        .single();

      if (erreurProfil || !profil) {
        setErreur("Profil introuvable.");
        setChargement(false);
        return;
      }

      // Écran réservé aux gérants/admin — un caissier est renvoyé à la caisse.
      // À terme, cette vérification doit être doublée côté middleware serveur.
      if (profil.role === "caissier") {
        setAccesRefuse(true);
        setChargement(false);
        return;
      }

      const magasinId = profil.magasin_id;

      const [
        { data: dataCa },
        { data: dataMeilleuresVentes },
        { data: dataValeurStock },
        { data: dataRotationLente },
        { data: dataReappro },
      ] = await Promise.all([
        supabase.rpc("rapport_chiffre_affaires", {
          p_magasin_id: magasinId,
          p_date_debut: AUJOURDHUI,
          p_date_fin: AUJOURDHUI,
        }),
        supabase.rpc("rapport_meilleures_ventes", { p_magasin_id: magasinId, p_limite: 5 }),
        supabase.rpc("rapport_valeur_stock", { p_magasin_id: magasinId }),
        supabase.rpc("rapport_rotation_lente", { p_magasin_id: magasinId, p_jours: 30 }),
        supabase.from("produits_a_reapprovisionner").select("*").eq("magasin_id", magasinId),
      ]);

      setCa(dataCa ?? []);
      setMeilleuresVentes(dataMeilleuresVentes ?? []);
      setValeurStock(dataValeurStock?.[0] ?? null);
      setRotationLente(dataRotationLente ?? []);
      setAReapprovisionner(dataReappro ?? []);
      setChargement(false);
    }

    charger();
  }, [supabase]);

  if (chargement) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--couleur-fond)" }}>
        <p style={{ color: "#8A8676" }}>Chargement du tableau de bord…</p>
      </main>
    );
  }

  if (accesRefuse) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "var(--couleur-fond)" }}>
        <p className="police-titre text-lg font-semibold">Accès réservé aux gérants</p>
        <a href="/caisse" className="text-sm underline" style={{ color: "var(--couleur-marque)" }}>
          Retour à la caisse
        </a>
      </main>
    );
  }

  const caDuJour = ca[0]?.chiffre_affaires ?? 0;
  const nombreVentesDuJour = ca[0]?.nombre_ventes ?? 0;

  return (
    <main className="min-h-screen" style={{ background: "var(--couleur-fond)" }}>
      <header
        className="flex items-center justify-between px-6 h-16 border-b"
        style={{ borderColor: "var(--couleur-bordure)", background: "var(--couleur-surface)" }}
      >
        <p className="police-titre font-semibold" style={{ color: "var(--couleur-marque)" }}>
          SOURA Marché · Gestion
        </p>
        <div className="flex items-center gap-5 text-sm">
          <a href="/gerant/produits" style={{ color: "var(--couleur-marque)" }}>
            Produits
          </a>
          <a href="/gerant/fournisseurs" style={{ color: "var(--couleur-marque)" }}>
            Fournisseurs
          </a>
          <a href="/gerant/employes" style={{ color: "var(--couleur-marque)" }}>
            Employés
          </a>
          <a href="/caisse" style={{ color: "var(--couleur-marque)" }}>
            Aller à la caisse →
          </a>
          <button
            onClick={async () => {
              const supabase = creerClientSupabase();
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
            style={{ color: "var(--couleur-marque)" }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      {erreur && (
        <p className="mx-6 mt-4 text-sm rounded-md px-3 py-2" style={{ background: "#FBEAE8", color: "var(--couleur-danger)" }}>
          {erreur}
        </p>
      )}

      <div className="max-w-5xl mx-auto p-6 flex flex-col gap-8">
        {/* Indicateurs du jour */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-px" style={{ background: "var(--couleur-bordure)" }}>
          <div className="p-5" style={{ background: "var(--couleur-surface)" }}>
            <p className="text-sm" style={{ color: "#8A8676" }}>Chiffre d&apos;affaires — aujourd&apos;hui</p>
            <p className="police-titre text-3xl font-bold mt-1">{formateurFCFA.format(caDuJour)} F</p>
          </div>
          <div className="p-5" style={{ background: "var(--couleur-surface)" }}>
            <p className="text-sm" style={{ color: "#8A8676" }}>Ventes — aujourd&apos;hui</p>
            <p className="police-titre text-3xl font-bold mt-1">{nombreVentesDuJour}</p>
          </div>
          <div className="p-5" style={{ background: "var(--couleur-surface)" }}>
            <p className="text-sm" style={{ color: "#8A8676" }}>Valeur du stock (prix de vente)</p>
            <p className="police-titre text-3xl font-bold mt-1">
              {formateurFCFA.format(valeurStock?.valeur_totale_vente ?? 0)} F
            </p>
          </div>
        </section>

        {/* Alerte réapprovisionnement — mise en avant si non vide */}
        {aReapprovisionner.length > 0 && (
          <section className="rounded-md p-5" style={{ background: "#FFF4EC", border: "1px solid #F0C9A8" }}>
            <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "var(--couleur-accent-sombre)" }}>
              À réapprovisionner ({aReapprovisionner.length})
            </h2>
            <ul className="flex flex-col gap-1.5">
              {aReapprovisionner.map((p) => (
                <li key={p.produit_id} className="flex items-center justify-between text-sm">
                  <span>{p.nom}</span>
                  <span style={{ color: "var(--couleur-accent-sombre)" }}>
                    {p.quantite} restant{p.quantite > 1 ? "s" : ""} (seuil : {p.seuil_reappro})
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Meilleures ventes */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Meilleures ventes (30 derniers jours)
          </h2>
          {meilleuresVentes.length === 0 ? (
            <p className="text-sm" style={{ color: "#8A8676" }}>Aucune vente sur cette période.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {meilleuresVentes.map((p) => (
                  <tr key={p.produit_id} className="border-b" style={{ borderColor: "var(--couleur-bordure)" }}>
                    <td className="py-2.5">{p.nom}</td>
                    <td className="py-2.5 text-right" style={{ color: "#8A8676" }}>{p.quantite_vendue} vendus</td>
                    <td className="py-2.5 text-right font-medium w-32">{formateurFCFA.format(p.chiffre_affaires)} F</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Rotation lente */}
        <section>
          <h2 className="police-titre font-semibold text-sm uppercase tracking-wide mb-3" style={{ color: "#6B6858" }}>
            Rotation lente — aucune vente depuis 30 jours
          </h2>
          {rotationLente.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--couleur-succes)" }}>Aucun produit dormant détecté.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {rotationLente.map((p) => (
                  <tr key={p.produit_id} className="border-b" style={{ borderColor: "var(--couleur-bordure)" }}>
                    <td className="py-2.5">{p.nom}</td>
                    <td className="py-2.5 text-right" style={{ color: "#8A8676" }}>
                      {p.derniere_vente ? `Dernière vente : ${new Date(p.derniere_vente).toLocaleDateString("fr-FR")}` : "Jamais vendu"}
                    </td>
                    <td className="py-2.5 text-right font-medium w-32">{p.quantite_stock} en stock</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
