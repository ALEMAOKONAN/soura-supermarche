import VersionApp from "@/components/VersionApp";

// Logo SOURA Marché : carré orange « S », nom, et numéro de version.
// `surFonce` : sur fond vert (menus), le texte passe en blanc.
export default function Logo({
  surFonce = false,
  taille = "normal",
  suffixe,
}: {
  surFonce?: boolean;
  taille?: "normal" | "grand";
  suffixe?: string;
}) {
  const grand = taille === "grand";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span
        aria-hidden
        className="police-titre font-bold text-white flex items-center justify-center shrink-0"
        style={{
          width: grand ? 48 : 38,
          height: grand ? 48 : 38,
          borderRadius: grand ? 12 : 10,
          fontSize: grand ? 26 : 21,
          background: "var(--couleur-accent)",
        }}
      >
        S
      </span>
      <p
        className="police-titre font-bold leading-tight min-w-0"
        style={{ fontSize: grand ? 26 : 19, color: surFonce ? "#FFFFFF" : "var(--couleur-marque)" }}
      >
        <span className="whitespace-nowrap">SOURA Marché</span>
        {suffixe && <span className="font-semibold whitespace-nowrap"> · {suffixe}</span>}
        <VersionApp couleur={surFonce ? "var(--couleur-sur-marque-2)" : undefined} />
      </p>
    </div>
  );
}
