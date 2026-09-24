import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Décode les claims personnalisés (role, magasin_id, organisation_id) injectés
// dans le JWT par le Custom Access Token Hook côté Supabase — évite une
// requête à la table `utilisateurs` à chaque navigation.
function decoderClaimsJwt(accessToken: string): { app_role?: string; doit_changer_mdp?: boolean } {
  try {
    const partiePayload = accessToken.split(".")[1];
    const jsonDecode = Buffer.from(partiePayload, "base64").toString("utf-8");
    return JSON.parse(jsonDecode);
  } catch {
    return {};
  }
}

const ROUTES_PUBLIQUES = ["/"];
const ROUTES_RESERVEES_GERANT = ["/gerant"];
const ROUTES_RESERVEES_ADMIN = ["/gerant/employes"];
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

  // getUser() (et non getSession()) revalide le token auprès de Supabase —
  // indispensable en middleware pour ne pas faire confiance à un cookie
  // qui pourrait avoir été falsifié côté client.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const chemin = request.nextUrl.pathname;
  const estRoutePublique = ROUTES_PUBLIQUES.includes(chemin);

  if (!user && !estRoutePublique) {
    const urlConnexion = request.nextUrl.clone();
    urlConnexion.pathname = "/";
    return NextResponse.redirect(urlConnexion);
  }

  if (!user) return reponse;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session ? decoderClaimsJwt(session.access_token) : {};

  // Mot de passe provisoire : tant qu'il n'a pas été remplacé, aucun écran
  // n'est accessible, sauf celui qui permet de le changer. Les appels /api
  // restent possibles (c'est par là que passe le changement lui-même).
  if (claims.doit_changer_mdp === true && chemin !== ROUTE_CHANGEMENT_MDP && !chemin.startsWith("/api/")) {
    const urlChangement = request.nextUrl.clone();
    urlChangement.pathname = ROUTE_CHANGEMENT_MDP;
    return NextResponse.redirect(urlChangement);
  }

  if (estRoutePublique) {
    const urlDestination = request.nextUrl.clone();
    // Un admin/gérant arrive directement sur son tableau de bord ; un
    // caissier, sur la caisse — sa seule interface au quotidien.
    urlDestination.pathname = claims.app_role === "caissier" ? "/caisse" : "/gerant";
    return NextResponse.redirect(urlDestination);
  }

  if (session && ROUTES_RESERVEES_GERANT.some((route) => chemin.startsWith(route))) {
    if (claims.app_role === "caissier") {
      const urlCaisse = request.nextUrl.clone();
      urlCaisse.pathname = "/caisse";
      return NextResponse.redirect(urlCaisse);
    }

    if (ROUTES_RESERVEES_ADMIN.some((route) => chemin.startsWith(route)) && claims.app_role !== "admin_org") {
      const urlGerant = request.nextUrl.clone();
      urlGerant.pathname = "/gerant";
      return NextResponse.redirect(urlGerant);
    }
  }

  return reponse;
}
