"use client";

import { useEffect, useMemo, useState } from "react";
import { creerClientSupabase } from "@/lib/supabase/client";
import { chargerProfilConnecte } from "@/lib/profil";
import Link from "next/link";
import EnTetePage from "@/components/EnTetePage";

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
  const [stocksNegatifs, setStocksNegatifs] = useState<{ produit_id: string; nom: string; quantite: number }[]>([]);
  const [ventesHorsLigne, setVentesHorsLigne] = useState(0);
  const [prenom, setPrenom] = useState("");

  useEffect(() => {
    async function charger() {
      const profil = await chargerProfilConnecte(supabase);

      if (!profil) {
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
      setPrenom(profil.nom_complet.split(/\s+/)[0] ?? "");

      const [
        { data: dataCa },
        { data: dataMeilleuresVentes },
        { data: dataValeurStock },
        { data: dataRotationLente },
        { data: dataReappro },
        { data: dataStocksNegatifs },
        { count: nbVentesHorsLigne },
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
        supabase.from("alertes_stock_negatif").select("produit_id, nom, quantite").eq("magasin_id", magasinId),
        supabase
          .from("ventes")
          .select("id", { count: "exact", head: true })
          .eq("magasin_id", magasinId)
          .eq("hors_ligne", true)
          .gte("cree_le", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      ]);

      setCa(dataCa ?? []);
      setMeilleuresVentes(dataMeilleuresVentes ?? []);
      setValeurStock(dataValeurStock?.[0] ?? null);
      setRotationLente(dataRotationLente ?? []);
      setAReapprovisionner(dataReappro ?? []);
      setStocksNegatifs(dataStocksNegatifs ?? []);
      setVentesHorsLigne(nbVentesHorsLigne ?? 0);
      setChargement(false);
    }

    charger();
  }, [supabase]);

  if (chargement) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "var(--couleur-fond)" }}>
        <p style={{ color: "var(--couleur-texte-3)" }}>Chargement du tableau de bord…</p>
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
  const panierMoyen = nombreVentesDuJour > 0 ? caDuJour / nombreVentesDuJour : 0;
  const maxVendu = Math.max(1, ...meilleuresVentes.map((p) => p.quantite_vendue));

  const heure = new Date().getHours();
  const salutation = heure < 18 ? "Bonjour" : "Bonsoir";
  const dateDuJour = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const indicateurs = [
    { libelle: "Chiffre d’affaires du jour", valeur: `${formateurFCFA.format(caDuJour)} F` },
    { libelle: "Ventes du jour", valeur: String(nombreVentesDuJour) },
    { libelle: "Panier moyen", valeur: `${formateurFCFA.format(panierMoyen)} F` },
    { libelle: "Valeur du stock", valeur: `${formateurFCFA.format(valeurStock?.valeur_totale_vente ?? 0)} F`, note: "au prix de vente" },
  ];

  return (
    <main className="pb-10">
      <EnTetePage
        surtitre={<span className="first-letter:uppercase inline-block">{dateDuJour}</span>}
        titre={prenom ? `${salutation} ${prenom}` : "Tableau de bord"}
      />

      <div className="px-5 md:px-8 pt-5 flex flex-col gap-5">
        {erreur && (
          <p role="alert" className="text-sm rounded-[10px] px-3.5 py-2.5" style={{ background: "#FDE3E1", color: "var(--couleur-danger)" }}>
            {erreur}
          </p>
        )}

        {/* Indicateurs du jour */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Indicateurs du jour">
          {indicateurs.map((k) => (
            <div key={k.libelle} className="carte p-5 flex flex-col gap-2.5">
              <p className="text-sm font-semibold" style={{ color: "var(--couleur-texte-2)" }}>{k.libelle}</p>
              <p className="police-titre text-[30px] leading-none font-bold tracking-tight" style={{ color: "var(--couleur-marque)" }}>
                {k.valeur}
              </p>
              {k.note && <span className="pastille pastille-neutre self-start">{k.note}</span>}
            </div>
          ))}
        </section>

        {/* Stock négatif — conséquence de ventes faites hors ligne */}
        {stocksNegatifs.length > 0 && (
          <section className="rounded-2xl p-5" style={{ background: "#FDE3E1", border: "1px solid #F5B8B2" }}>
            <h2 className="titre-section mb-1" style={{ color: "#9B1C14" }}>
              Stock négatif à corriger ({stocksNegatifs.length})
            </h2>
            <p className="text-sm mb-3" style={{ color: "#9B1C14" }}>
              Des ventes faites pendant une coupure internet ont dépassé le stock enregistré. Comptez ces
              articles en rayon, puis ajoutez le stock réel dans « Produits et stock ».
            </p>
            <ul className="flex flex-col">
              {stocksNegatifs.map((p) => (
                <li key={p.produit_id} className="flex items-center justify-between gap-3 py-2 border-t text-[15px]" style={{ borderColor: "#F5B8B2" }}>
                  <span className="font-semibold">{p.nom}</span>
                  <span className="pastille pastille-rupture">{p.quantite} en stock</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* À réapprovisionner */}
          <section className="carte p-5 md:p-6 flex flex-col">
            <div className="flex items-baseline justify-between gap-3 pb-2">
              <h2 className="titre-section">À réapprovisionner</h2>
              <Link href="/gerant/produits" className="text-sm font-semibold" style={{ color: "var(--couleur-marque)" }}>
                Voir le stock
              </Link>
            </div>
            {aReapprovisionner.length === 0 ? (
              <p className="text-[15px] py-2" style={{ color: "var(--couleur-succes)" }}>Tout est au-dessus du seuil.</p>
            ) : (
              <ul className="flex flex-col">
                {aReapprovisionner.map((p) => (
                  <li key={p.produit_id} className="flex items-center justify-between gap-3 py-2.5 border-t" style={{ borderColor: "var(--couleur-ligne)" }}>
                    <span className="flex flex-col">
                      <span className="text-[15px] font-semibold">{p.nom}</span>
                      <span className="text-[13px]" style={{ color: "var(--couleur-texte-2)" }}>
                        Réapprovisionner sous {p.seuil_reappro}
                      </span>
                    </span>
                    <span className={`pastille ${p.quantite <= 0 ? "pastille-rupture" : "pastille-bas"}`}>
                      {p.quantite <= 0 ? "Rupture" : `${p.quantite} restant${p.quantite > 1 ? "s" : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Meilleures ventes */}
          <section className="carte p-5 md:p-6 flex flex-col gap-4">
            <h2 className="titre-section">Meilleures ventes <span className="text-sm font-medium" style={{ color: "var(--couleur-texte-2)" }}>· 30 jours</span></h2>
            {meilleuresVentes.length === 0 ? (
              <p className="text-[15px]" style={{ color: "var(--couleur-texte-3)" }}>Aucune vente sur cette période.</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {meilleuresVentes.map((p) => (
                  <li key={p.produit_id} className="flex flex-col gap-1.5">
                    <div className="flex justify-between gap-3 text-[15px]">
                      <span className="font-semibold">{p.nom}</span>
                      <span style={{ color: "var(--couleur-texte-2)" }}>
                        {p.quantite_vendue} vendus · {formateurFCFA.format(p.chiffre_affaires)} F
                      </span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "var(--couleur-ligne)" }}>
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${Math.round((p.quantite_vendue / maxVendu) * 100)}%`, background: "var(--couleur-marque-claire)" }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Ventes hors ligne */}
          <section className="rounded-2xl p-5 md:p-6 flex flex-col gap-2 text-white" style={{ background: "var(--couleur-marque)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--couleur-sur-marque-2)" }}>Coupures internet · 7 derniers jours</p>
            <p className="police-titre text-2xl font-bold">
              {ventesHorsLigne === 0 ? "Aucune vente faite hors ligne" : `${ventesHorsLigne} vente${ventesHorsLigne > 1 ? "s" : ""} faite${ventesHorsLigne > 1 ? "s" : ""} hors ligne`}
            </p>
            <p className="text-sm" style={{ color: "var(--couleur-sur-marque)" }}>
              {ventesHorsLigne === 0
                ? "Les caisses sont restées connectées."
                : "Elles ont été gardées sur les postes, puis envoyées au retour de la connexion."}
            </p>
          </section>

          {/* Rotation lente */}
          <section className="carte p-5 md:p-6 flex flex-col">
            <h2 className="titre-section pb-2">Articles qui dorment <span className="text-sm font-medium" style={{ color: "var(--couleur-texte-2)" }}>· aucune vente depuis 30 jours</span></h2>
            {rotationLente.length === 0 ? (
              <p className="text-[15px] py-2" style={{ color: "var(--couleur-succes)" }}>Aucun produit dormant détecté.</p>
            ) : (
              <ul className="flex flex-col">
                {rotationLente.map((p) => (
                  <li key={p.produit_id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2.5 border-t text-[15px]" style={{ borderColor: "var(--couleur-ligne)" }}>
                    <span className="font-semibold">{p.nom}</span>
                    <span style={{ color: "var(--couleur-texte-2)" }}>
                      {p.derniere_vente ? `Dernière vente le ${new Date(p.derniere_vente).toLocaleDateString("fr-FR")}` : "Jamais vendu"} · {p.quantite_stock} en stock
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
