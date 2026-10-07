"use client";

// ============================================================================
// Petits sons de caisse, générés par le navigateur (aucun fichier à charger,
// fonctionne hors ligne et dans l'exe) :
//   - bipOk     : article ajouté (bip court et aigu, comme un scanner)
//   - bipErreur : code inconnu (deux bips graves)
// ============================================================================

let contexte: AudioContext | null = null;

function jouer(frequences: number[], duree: number, ecart = 0.06, volume = 0.08) {
  try {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    contexte ??= new Ctx();
    if (contexte.state === "suspended") void contexte.resume();
    let debut = contexte.currentTime;
    for (const f of frequences) {
      const osc = contexte.createOscillator();
      const gain = contexte.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(volume, debut);
      gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
      osc.connect(gain).connect(contexte.destination);
      osc.start(debut);
      osc.stop(debut + duree);
      debut += duree + ecart;
    }
  } catch {
    // Pas de son disponible : la caisse continue normalement.
  }
}

export const bipOk = () => jouer([1760], 0.07);
export const bipErreur = () => jouer([330, 330], 0.14, 0.08, 0.1);
