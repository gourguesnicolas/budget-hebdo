import type { ThemeKey } from "./types";
export const THEMES: Record<ThemeKey, { label: string; emoji: string; sub: string; sw: string[] }> = {
  autumn: { label: "Automne", emoji: "🍂", sub: "Orangé, brun et jaune", sw: ["#D9641E", "#F2A03D", "#F4C542", "#4E2A14"] },
  winter: { label: "Hiver", emoji: "❄️", sub: "Neige, vent et turquoise", sw: ["#0A8794", "#4FC3D4", "#DCEBF0", "#FFFFFF"] },
  spring: { label: "Printemps", emoji: "🌸", sub: "Rose, ciel et jaune", sw: ["#D63F7E", "#6EB9EA", "#FFD84D", "#FFF6F8"] },
  summer: { label: "Été", emoji: "☀️", sub: "Ciel, vert et sable", sw: ["#1F8A5B", "#58B7E6", "#E8D49A", "#FBF6E8"] }
};
