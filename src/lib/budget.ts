import type { AppState, Expense, WeekStats } from "../types";
import { addDays, iso, parse, payWeek, weekStartOf } from "./dates";

export const DEFAULT_CATS = ["Restaurant", "Café", "Sorties & bars", "Cinéma & spectacles", "Jeux vidéo", "Sport & plein air", "Magasinage", "Autre"];

export function freshState(): AppState {
  return { v: 2, payDay: 4, defaults: [], weeks: {}, expenses: [], categories: DEFAULT_CATS.slice(), nextId: 1, lastExport: null, theme: "auto", fx: true };
}

/** Identifiant unique entre appareils (deux appareils ne risquent pas de créer le même). */
export const newId = (): number => Date.now() * 1000 + Math.floor(Math.random() * 1000);

export const weekKeyOf = (d: Date, s: Pick<AppState, "payDay">): string => iso(weekStartOf(d, s.payDay));
export const weekNumber = (d: Date, payDay: number): { year: number; week: number } => payWeek(d, payDay);

export function budgetFor(s: AppState, wk: string): number | null {
  const w = s.weeks[wk];
  if (w && typeof w.budget === "number") return w.budget;
  const h = s.defaults;
  if (!h.length) return null;
  let a = h[0].amount;
  for (const x of h) { if (x.from <= wk) a = x.amount; }
  return a;
}
export const isCustom = (s: AppState, wk: string): boolean => { const w = s.weeks[wk]; return !!(w && typeof w.budget === "number"); };

export function withDefault(s: AppState, from: string, amount: number): AppState {
  const defaults = s.defaults.filter(x => x.from !== from).concat({ from, amount }).sort((a, b) => (a.from < b.from ? -1 : 1));
  return { ...s, defaults };
}

export function weekStats(s: AppState, wk: string): WeekStats {
  const start = parse(wk), end = addDays(start, 6), e = iso(end);
  const list = s.expenses.filter(x => x.date >= wk && x.date <= e).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  const spent = list.reduce((t, x) => t + x.amount, 0);
  const budget = budgetFor(s, wk);
  const ratio = budget != null && budget > 0 ? spent / budget : (spent > 0 ? 9.99 : 0);
  return { wk, start, end, list, spent, budget, ratio };
}

export function firstTracked(s: AppState): string | null {
  const c: string[] = [];
  if (s.defaults.length) c.push(s.defaults[0].from);
  if (s.expenses.length) c.push(iso(weekStartOf(parse(s.expenses.reduce((m, x) => (x.date < m ? x.date : m), "9999-12-31")), s.payDay)));
  Object.keys(s.weeks).forEach(k => c.push(k));
  return c.length ? c.reduce((a, b) => (a < b ? a : b)) : null;
}

export function summaryData(s: AppState, year: number): { weeks: WeekStats[]; todayWk: string } {
  const todayWk = weekKeyOf(new Date(), s), first = firstTracked(s), weeks: WeekStats[] = [];
  if (first) {
    let d = weekStartOf(new Date(year, 0, 1), s.payDay);
    if (d.getFullYear() < year) d = addDays(d, 7);
    while (d.getFullYear() === year) { const wk = iso(d); if (wk >= first && wk <= todayWk) weeks.push(weekStats(s, wk)); d = addDays(d, 7); }
  }
  return { weeks, todayWk };
}

export function niceStep(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Migration : anciennes données (semaines du lundi) → semaines commençant le jour de paie. Modifie une copie. */
export function migrate(st: AppState, toDay?: number): AppState {
  const nd = toDay == null ? 4 : toDay, od = typeof st.payDay === "number" ? st.payDay : 1;
  if (typeof st.payDay === "number" && od === nd) return st;
  const mv = (k: string): string => iso(weekStartOf(addDays(parse(k), 3), nd));   // par le milieu de la semaine : pas de dérive
  const weeks: AppState["weeks"] = {};
  Object.keys(st.weeks || {}).forEach(k => { const m = mv(k); weeks[m] = Object.assign(weeks[m] || {}, st.weeks[k]); });
  const dm = new Map<string, number>(); (st.defaults || []).forEach(x => dm.set(mv(x.from), x.amount));
  const defaults = [...dm].map(([from, amount]) => ({ from, amount })).sort((a, b) => (a.from < b.from ? -1 : 1));
  return { ...st, weeks, defaults, payDay: nd, v: 2 };
}

export const isExpense = (x: unknown): x is Expense =>
  !!x && typeof (x as Expense).amount === "number" && /^\d{4}-\d{2}-\d{2}$/.test(String((x as Expense).date));
