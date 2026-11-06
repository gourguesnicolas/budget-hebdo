import type { DefaultBudget, ThemeChoice, WeekOverrides } from "../types";

export interface CloudUser { uid: string; email: string | null }
export interface ExpenseData { amount: number; date: string; desc: string; cat: string }
/** `theme` est facultatif : les réglages enregistrés avant sa synchronisation ne l'ont pas. */
export interface MetaData { payDay: number; defaults: DefaultBudget[]; weeks: WeekOverrides; categories: string[]; theme?: ThemeChoice }

export interface ExpensesEvent {
  docs: { id: string; data: ExpenseData }[];
  changes: { type: "added" | "modified" | "removed"; id: string; data: ExpenseData; pending: boolean }[];
  fromCache: boolean;
}
export interface MetaEvent { exists: boolean; data: MetaData | undefined; fromCache: boolean; pending: boolean }
export interface ListenHandlers { onExpenses(e: ExpensesEvent): void; onMeta(e: MetaEvent): void; onError(e: unknown): void }
export interface WriteBatch { sets: { id: string; data: ExpenseData }[]; dels: string[]; meta: MetaData | null }

/** Ce que l'engin de synchronisation attend d'un service cloud (Firebase en vrai, un faux dans les tests). */
export interface Backend {
  onAuth(cb: (u: CloudUser | null) => void): () => void;
  signInGoogle(): Promise<void>;
  signInGoogleRedirect?(): Promise<void>;
  signInEmail(email: string, password: string): Promise<void>;
  signUpEmail(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  listen(uid: string, h: ListenHandlers): () => void;
  write(w: WriteBatch): Promise<void>;
}

export type CloudStatus = "off" | "connecting" | "signedout" | "synced" | "error";
export interface CloudSnapshot {
  status: CloudStatus;
  reason: "" | "config" | "file";
  errMsg: string;
  user: CloudUser | null;
  inflight: number;
  online: boolean;
}
export interface Result { ok: boolean; message?: string }
