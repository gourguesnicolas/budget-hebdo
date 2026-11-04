import { useEffect, useRef, useState } from "react";
import { startParticles } from "../particles/engine";
import type { ThemeKey } from "../types";

function useMedia(q: string): boolean {
  const [v, setV] = useState(() => matchMedia(q).matches);
  useEffect(() => { const m = matchMedia(q), h = () => setV(m.matches); m.addEventListener("change", h); return () => m.removeEventListener("change", h); }, [q]);
  return v;
}
/** Particules propres à la saison, sur toute la page (le canvas laisse passer les clics). */
export function ParticlesLayer({ theme, enabled }: { theme: ThemeKey; enabled: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const dark = useMedia("(prefers-color-scheme: dark)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  useEffect(() => {
    if (!enabled || reduced || !host.current) return;
    return startParticles(host.current, theme, dark);
  }, [theme, dark, enabled, reduced]);
  return <div id="particles-js" ref={host} aria-hidden="true" />;
}
