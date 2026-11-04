export interface Expense { id: number; date: string; amount: number; desc: string; cat: string }
export interface DefaultBudget { from: string; amount: number }
export type ThemeKey = "autumn" | "winter" | "spring" | "summer";
export type ThemeChoice = ThemeKey | "auto";
export type WeekOverrides = Record<string, { budget?: number }>;

export interface AppState {
  v: number;
  payDay: number;                 // 0 = dimanche … 6 = samedi ; jour où commence chaque « semaine » de budget
  defaults: DefaultBudget[];      // historique du budget par défaut
  weeks: WeekOverrides;           // budgets personnalisés par semaine (clé = date de début)
  expenses: Expense[];
  categories: string[];
  nextId: number;
  lastExport: string | null;
  theme: ThemeChoice;             // préférence propre à l'appareil (non synchronisée)
  fx: boolean;                    // idem
}

export interface WeekStats {
  wk: string; start: Date; end: Date; list: Expense[];
  spent: number; budget: number | null; ratio: number;
}
export type Tab = "week" | "exp" | "sum" | "set";
