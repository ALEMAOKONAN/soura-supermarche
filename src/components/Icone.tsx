// Icônes au trait, dessinées en SVG (aucune dépendance, s'affichent hors ligne).
// Elles prennent la couleur du texte autour (currentColor).

const TRACES = {
  tableau: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  produits: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </>
  ),
  fournisseurs: (
    <>
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  employes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.8c1.9.7 3.1 2.4 3.5 5.2" />
    </>
  ),
  caisse: (
    <>
      <rect x="3" y="10" width="18" height="10" rx="2" />
      <path d="M7 10V5h10v5" />
      <path d="M7 15h2M11 15h2M15 15h2" />
    </>
  ),
  codeBarre: (
    <>
      <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" />
    </>
  ),
  recherche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  actualiser: (
    <>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </>
  ),
  sortie: (
    <>
      <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M10 17l-5-5 5-5" />
      <path d="M5 12h11" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  fermer: <path d="M6 6l12 12M18 6 6 18" />,
};

export type NomIcone = keyof typeof TRACES;

export default function Icone({ nom, taille = 20 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {TRACES[nom]}
    </svg>
  );
}
