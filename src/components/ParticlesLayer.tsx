import { useEffect, useRef } from "react";
import { startParticles } from "../particles/engine";
import { useMedia } from "../lib/useMedia";
import type { ThemeKey } from "../types";
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
