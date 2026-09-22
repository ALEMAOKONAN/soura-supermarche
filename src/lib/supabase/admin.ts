import "server-only";
import { createClient } from "@supabase/supabase-js";

// Client "admin" utilisant la clé service_role — contourne TOUTE la RLS.
// `server-only` empêche ce fichier d'être importé, même par erreur, dans un
// composant client : la build échouerait immédiatement si quelqu'un essayait.
// Ne JAMAIS préfixer la variable d'environnement associée par NEXT_PUBLIC_.
export function creerClientSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "supermarche" },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
