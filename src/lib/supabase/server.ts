// Client Supabase côté serveur (Server Components, Route Handlers).
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function creerClientSupabaseServeur() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'supermarche' },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesAPoser) {
          try {
            cookiesAPoser.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Appelé depuis un Server Component : ignoré si un middleware
            // gère déjà le rafraîchissement de session.
          }
        },
      },
    }
  )
}
