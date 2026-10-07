// En-tête des écrans de gestion : petite ligne d'info, grand titre, actions à droite.
export default function EnTetePage({
  titre,
  surtitre,
  actions,
}: {
  titre: string;
  surtitre?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-5 md:px-8 pt-7 pb-2">
      <div className="flex flex-col gap-1 min-w-0">
        {surtitre && (
          <p className="text-sm" style={{ color: "var(--couleur-texte-2)" }}>
            {surtitre}
          </p>
        )}
        <h1 className="police-titre font-bold text-3xl md:text-[34px] tracking-tight">{titre}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
