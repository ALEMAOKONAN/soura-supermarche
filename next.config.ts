import type { NextConfig } from "next";
import { version } from "./package.json";

// Estampille de version, calculée à chaque construction (sur Vercel ou en local) :
//   - numéro de version : champ "version" de package.json
//   - date de construction : moment exact de la mise en ligne
//   - commit : référence Git fournie automatiquement par Vercel
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERSION_APP: version,
    NEXT_PUBLIC_DATE_VERSION: new Date().toISOString(),
    NEXT_PUBLIC_COMMIT_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    NEXT_PUBLIC_ENVIRONNEMENT: process.env.VERCEL_ENV ?? "local",
  },
};

export default nextConfig;
