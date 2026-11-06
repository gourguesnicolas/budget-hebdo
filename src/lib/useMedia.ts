import { useEffect, useState } from "react";

/** Vrai tant que la requête média correspond (se met à jour si l'écran change, ex. rotation du téléphone). */
export function useMedia(q: string): boolean {
  const [v, setV] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), h = (): void => setV(m.matches);
    h(); m.addEventListener("change", h); return () => m.removeEventListener("change", h);
  }, [q]);
  return v;
}

/** Même seuil que le CSS mobile (styles.css). */
export const NARROW = "(max-width: 640px)";
export const useNarrow = (): boolean => useMedia(NARROW);
