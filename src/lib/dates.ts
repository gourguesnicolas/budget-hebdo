import type { ThemeChoice, ThemeKey } from "../types";

export const pad = (n: number): string => String(n).padStart(2, "0");
export const iso = (d: Date): string => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const parse = (s: string): Date => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const daysBetween = (a: string, b: string): number => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
export const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."] as const;

/** Une « semaine » commence le jour de paie (jeudi par défaut) et se termine la veille de la prochaine paie. */
export const weekStartOf = (d: Date, payDay: number): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() - payDay + 7) % 7));
};

/** Numéro de la semaine de paie dans l'année (année = année du début de la période). */
export function payWeek(d: Date, payDay: number): { year: number; week: number } {
  const st = weekStartOf(d, payDay), year = st.getFullYear();
  let first = weekStartOf(new Date(year, 0, 1), payDay);
  if (first.getFullYear() < year) first = addDays(first, 7);
  return { year, week: 1 + Math.round((st.getTime() - first.getTime()) / 604800000) };
}

const fShort = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
export const fWd = new Intl.DateTimeFormat("fr-CA", { weekday: "long" });
export const fWdS = new Intl.DateTimeFormat("fr-CA", { weekday: "short", day: "numeric", month: "short" });
export const shortDate = (d: Date): string => fShort.format(d);
export const range = (a: Date, b: Date): string => fShort.format(a) + " au " + fShort.format(b);
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
export const fm = (n: number | null | undefined): string => money.format(n || 0);

export function seasonOf(d: Date): ThemeKey {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  return (md >= 1221 || md < 320) ? "winter" : md < 621 ? "spring" : md < 922 ? "summer" : "autumn";
}
export const THEME_CHOICES: readonly ThemeChoice[] = ["auto", "autumn", "winter", "spring", "summer"];
/** Thème à afficher. « auto » (4 saisons, le défaut) ou une valeur inconnue → la saison réelle. */
export function resolveTheme(t: ThemeChoice | string | undefined): ThemeKey {
  return t === "autumn" || t === "winter" || t === "spring" || t === "summer" ? t : seasonOf(new Date());
}
