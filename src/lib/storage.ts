import type { AppState } from "../types";
import { freshState, migrate } from "./budget";

export const KEY = "budget-hebdo-v1";          // même clé que l'ancienne version : tes données locales sont reprises
export const SYNC_KEY = "budget-hebdo-sync-v1";
export const OWNER_KEY = "budget-hebdo-owner-v1";

export let storageOK = true;

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<AppState>;
      if (s && Array.isArray(s.expenses)) {
        if (typeof s.payDay !== "number") s.payDay = 1;   // ancienne version : semaines du lundi
        return migrate(Object.assign(freshState(), s));
      }
    }
  } catch { storageOK = false; }
  return freshState();
}
export function saveLocal(s: AppState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { storageOK = false; }
}
export const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
export const lsDel = (k: string): void => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
