// Client Supabase côté navigateur.
// IMPORTANT : .schema('supermarche') est indispensable sur CHAQUE requête —
// sans ça, PostgREST cherche par défaut dans le schéma `public` (utilisé par
// SOURA DIGITAL dans le même projet Supabase).
import { createBrowserClient } from '@supabase/ssr'

export function creerClientSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'supermarche' } }
  )
}
