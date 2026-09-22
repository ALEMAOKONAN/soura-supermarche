import { type NextRequest } from "next/server";
import { mettreAJourSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return mettreAJourSession(request);
}

export const config = {
  matcher: [
    /*
     * S'applique à toutes les routes SAUF les fichiers statiques et
     * ressources internes Next.js, pour ne pas ralentir le chargement
     * des images/CSS/JS avec une vérification de session inutile.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
