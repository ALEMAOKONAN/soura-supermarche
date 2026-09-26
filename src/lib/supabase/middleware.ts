import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accueilDuRole, peutAcceder } from "@/lib/roles";

// Informations ajoutées au jeton de connexion par le Custom Access Token Hook
// côté Supabase — évite une requête à la table `utilisateurs` à chaque page.
type ClaimsSoura = { app_role?: string; doit_changer_mdp?: boolean };

const ROUTES_PUBLIQUES = ["/"];
const ROUTE_CHANGEMENT_MDP = "/changer-mot-de-passe";

export async function mettreAJourSession(request: NextRequest) {
  let reponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "supermarche" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesAPoser) {
          cookiesAPoser.forEach(({ name, value }) => request.cookies.set(name, value));
          reponse = NextResponse.next({ request });
          cookiesAPoser.forEach(({ name, value, options }) =>
            reponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() vérifie la signature du jeton de connexion. Avec les clés de
  // signature asymétriques de Supabase, cette vérification se fait ici même,
  // sans aller-retour vers Supabase (c'était l'étape la plus lente de chaque
  // page). Avec l'ancienne clé partagée, getClaims() interroge Supabase comme
  // avant : jamais moins sûr, simplement plus rapide quand c'est possible.
  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims ?? null) as (ClaimsSoura & { sub?: string }) | null;
  const connecte = Boolean(claims?.sub);

  const chemin = request.nextUrl.pathname;
  const estRoutePublique = ROUTES_PUBLIQUES.includes(chemin);

  if (!connecte && !estRoutePublique) {
    const urlConnexion = request.nextUrl.clone();
    urlConnexion.pathname = "/";
    return NextResponse.redirect(urlConnexion);
  }

  if (!claims || !connecte) return reponse;

  // Mot de passe provisoire : tant qu'il n'a pas été remplacé, aucun écran
  // n'est accessible, sauf celui qui permet de le changer. Les appels /api
  // restent possibles (c'est par là que passe le changement lui-même).
  if (claims.doit_changer_mdp === true && chemin !== ROUTE_CHANGEMENT_MDP && !chemin.startsWith("/api/")) {
    const urlChangement = request.nextUrl.clone();
    urlChangement.pathname = ROUTE_CHANGEMENT_MDP;
    return NextResponse.redirect(urlChangement);
  }

  if (estRoutePublique) {
    // Chacun arrive sur son écran de travail : caisse pour un caissier,
    // produits pour un gestionnaire de stock, tableau de bord sinon.
    const urlDestination = request.nextUrl.clone();
    urlDestination.pathname = accueilDuRole(claims.app_role);
    return NextResponse.redirect(urlDestination);
  }

  // Écran non autorisé pour ce rôle : retour à son écran de travail.
  // (Les règles par rôle sont centralisées dans src/lib/roles.ts.)
  if (!peutAcceder(claims.app_role, chemin)) {
    const urlDestination = request.nextUrl.clone();
    urlDestination.pathname = accueilDuRole(claims.app_role);
    return NextResponse.redirect(urlDestination);
  }

  return reponse;
}
