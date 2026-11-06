/*
 * Synchronisation cloud — indépendante de React et de Firebase (testable seule).
 *
 * Principe : les données restent d'abord dans le navigateur (l'app marche hors ligne). Quand on est connecté,
 * chaque changement local est envoyé (seulement la différence) et les changements des autres appareils arrivent en direct.
 * Chaque dépense est un document distinct : deux appareils qui ajoutent des dépenses en même temps ne s'écrasent pas.
 */
import type { AppState, Expense, ThemeChoice } from "../types";
import { DEFAULT_CATS, freshState } from "../lib/budget";
import { THEME_CHOICES } from "../lib/dates";
import { OWNER_KEY, SYNC_KEY, lsDel, lsGet, lsSet } from "../lib/storage";
import type { Backend, CloudSnapshot, CloudStatus, CloudUser, ExpenseData, ExpensesEvent, MetaData, MetaEvent, Result } from "./types";

export interface SyncHost {
  getState(): AppState;
  /** Applique un changement venu du cloud : sauvegarde locale + rendu, sans le renvoyer au cloud. */
  applyRemote(fn: (s: AppState) => AppState): void;
}
export interface KV { get(k: string): string | null; set(k: string, v: string): void; del(k: string): void }
export interface LastSynced { uid: string | null; exp: Record<string, string>; meta: string | null }

/* ---- utilitaires purs (exportés pour les tests) ---- */
export const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.keys(val as object).sort().reduce<Record<string, unknown>>((o, k) => { o[k] = (val as Record<string, unknown>)[k]; return o; }, {})
      : val);
export const expData = (x: { amount: unknown; date: unknown; desc?: unknown; cat?: unknown }): ExpenseData =>
  ({ amount: Number(x.amount), date: String(x.date), desc: String(x.desc || ""), cat: String(x.cat || "") });
export const expJson = (x: Expense | ExpenseData): string => stable(expData(x));
export const metaOf = (s: AppState): MetaData => ({ payDay: s.payDay, defaults: s.defaults, weeks: s.weeks, categories: s.categories, theme: s.theme });
/** Réglages lus du cloud. Un thème absent (anciens réglages) ou inconnu est omis : le thème local est alors conservé puis envoyé. */
const normMeta = (m: Partial<MetaData>): MetaData => {
  const o: MetaData = { payDay: m.payDay as number, defaults: m.defaults || [], weeks: m.weeks || {}, categories: m.categories || [] };
  if (THEME_CHOICES.includes(m.theme as ThemeChoice)) o.theme = m.theme;
  return o;
};
const toId = (id: string): number => { const n = Number(id); return Number.isFinite(n) ? n : (id as unknown as number); };

export function isPristine(s: AppState): boolean {
  return !s.expenses.length && !s.defaults.length && !Object.keys(s.weeks).length && stable(s.categories) === stable(DEFAULT_CATS);
}
/** Fusion de deux jeux de réglages : le cloud gagne en cas de conflit ; on garde ce qui n'existe que d'un côté. */
export function mergeMeta(local: MetaData, cloud: MetaData): MetaData {
  const dm = new Map<string, number>();
  local.defaults.forEach(x => dm.set(x.from, x.amount));
  cloud.defaults.forEach(x => dm.set(x.from, x.amount));
  const cats = cloud.categories.slice(); local.categories.forEach(c => { if (!cats.includes(c)) cats.push(c); });
  return {
    payDay: typeof cloud.payDay === "number" ? cloud.payDay : local.payDay,
    defaults: [...dm].map(([from, amount]) => ({ from, amount })).sort((a, b) => (a.from < b.from ? -1 : 1)),
    weeks: { ...local.weeks, ...cloud.weeks }, categories: cats,
    theme: cloud.theme ?? local.theme
  };
}

export function authMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Courriel ou mot de passe incorrect.", "auth/wrong-password": "Courriel ou mot de passe incorrect.",
    "auth/user-not-found": "Courriel ou mot de passe incorrect.", "auth/email-already-in-use": "Un compte existe déjà avec ce courriel : utilise « Se connecter ».",
    "auth/weak-password": "Mot de passe trop court (6 caractères minimum).", "auth/invalid-email": "Courriel invalide.",
    "auth/too-many-requests": "Trop d'essais : réessaie dans quelques minutes.", "auth/network-request-failed": "Pas de connexion internet.",
    "auth/popup-closed-by-user": "Connexion annulée.", "auth/cancelled-popup-request": "Connexion annulée.",
    "auth/operation-not-allowed": "Cette méthode de connexion n'est pas activée dans Firebase (voir le guide).",
    "auth/admin-restricted-operation": "La création de compte est désactivée dans Firebase.",
    "auth/unauthorized-domain": "Ce site n'est pas dans les « domaines autorisés » de Firebase (voir le guide)."
  };
  return map[code] ?? "Connexion impossible (" + (code || (e as Error)?.message || "erreur") + ").";
}
function syncMessage(e: unknown): string {
  const c = (e as { code?: string })?.code ?? (e as Error)?.message ?? "";
  if (/permission-denied/.test(c)) return "Accès refusé : vérifie les règles Firestore (voir le guide).";
  if (/unavailable|network/.test(c)) return "Réseau indisponible : les changements seront envoyés plus tard.";
  return "Erreur de synchronisation (" + c + ").";
}

export class CloudSync {
  private be: Backend | null = null;
  private user: CloudUser | null = null;
  private unsubAuth: (() => void) | null = null;
  private unsub: (() => void) | null = null;
  private ready = false;
  private status: CloudStatus = "off";
  private reason: CloudSnapshot["reason"] = "";
  private errMsg = "";
  private last: LastSynced = { uid: null, exp: {}, meta: null };
  private pushT: ReturnType<typeof setTimeout> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstExp: ExpensesEvent | null = null;
  private firstMeta: MetaEvent | null = null;
  private applying = false;
  private inflight = 0;
  private listeners = new Set<() => void>();
  private snap: CloudSnapshot = { status: "off", reason: "", errMsg: "", user: null, inflight: 0, online: true };
  private handshakeDelay = 6000;
  private kv: KV = { get: lsGet, set: lsSet, del: lsDel };

  constructor(private host: SyncHost, opts: { handshakeTimeoutMs?: number; kv?: KV } = {}) {
    if (opts.handshakeTimeoutMs != null) this.handshakeDelay = opts.handshakeTimeoutMs;
    if (opts.kv) this.kv = opts.kv;
    if (typeof addEventListener === "function") {
      addEventListener("online", () => { this.emit(); if (this.ready) this.schedulePush(200); });
      addEventListener("offline", () => this.emit());
    }
  }

  /* ---- observable (useSyncExternalStore) ---- */
  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = (): CloudSnapshot => this.snap;
  private online = (): boolean => typeof navigator === "undefined" || navigator.onLine !== false;
  private emit(): void {
    const n: CloudSnapshot = { status: this.status, reason: this.reason, errMsg: this.errMsg, user: this.user, inflight: this.inflight, online: this.online() };
    const p = this.snap;
    if (p.status === n.status && p.reason === n.reason && p.errMsg === n.errMsg && p.user === n.user && p.inflight === n.inflight && p.online === n.online) return;
    this.snap = n; this.listeners.forEach(l => l());
  }
  private setStatus(s: CloudStatus, extra = ""): void {
    this.status = s; if (s === "error") this.errMsg = extra; if (s === "off") this.reason = extra as CloudSnapshot["reason"]; this.emit();
  }

  /** Branche le service cloud. `backend` : un faux dans les tests ; sinon Firebase chargé à la demande. */
  async init(cfg: Record<string, string | undefined> | null, backend?: Backend): Promise<void> {
    if (backend) this.be = backend;
    else {
      if (!cfg || !cfg.apiKey || /COLLE|YOUR|XXXX/i.test(cfg.apiKey)) { this.setStatus("off", "config"); return; }
      if (!/^https?:$/.test(location.protocol)) { this.setStatus("off", "file"); return; }
      this.setStatus("connecting");
      try { const m = await import("./firebaseBackend"); this.be = await m.createFirebaseBackend(cfg); }
      catch (e) { console.error(e); this.setStatus("error", "Impossible de charger Firebase (réseau ou bloqueur de contenu ?)."); return; }
    }
    this.setStatus("connecting");
    this.unsubAuth = this.be.onAuth(u => this.onUser(u));
  }
  dispose(): void { this.unsubAuth?.(); this.unsub?.(); clearTimeout(this.pushT); clearTimeout(this.timer); }

  /** À appeler après chaque changement fait par l'utilisateur sur cet appareil. */
  notifyLocalChange = (): void => { if (!this.applying) this.schedulePush(); };
  get hasPending(): boolean { return this.inflight > 0 || !this.online(); }

  /* ---- envoi (seulement ce qui a changé) ---- */
  private schedulePush(delay = 500): void { clearTimeout(this.pushT); this.pushT = setTimeout(() => this.push(), delay); }
  private push(): void {
    if (!this.ready || !this.be || !this.user) return;
    const s = this.host.getState(), last = this.last;
    const sets: { id: string; data: ExpenseData; j: string }[] = [], dels: string[] = [], cur = new Set<string>(), old: Record<string, string | undefined> = {};
    const mj = stable(metaOf(s));
    s.expenses.forEach(x => { const id = String(x.id), j = expJson(x); cur.add(id); if (last.exp[id] !== j) sets.push({ id, data: expData(x), j }); });
    Object.keys(last.exp).forEach(id => { if (!cur.has(id)) dels.push(id); });
    const metaChanged = last.meta !== mj;
    if (!sets.length && !dels.length && !metaChanged) return;
    sets.forEach(x => { old[x.id] = last.exp[x.id]; last.exp[x.id] = x.j; });
    dels.forEach(id => { old[id] = last.exp[id]; delete last.exp[id]; });
    const oldMeta = last.meta; if (metaChanged) last.meta = mj; this.saveLast();
    this.inflight++; this.emit();
    this.be.write({ sets: sets.map(x => ({ id: x.id, data: x.data })), dels, meta: metaChanged ? metaOf(s) : null }).then(() => {
      this.inflight--; if (this.status === "error") this.setStatus("synced"); else this.emit();
    }).catch((e: unknown) => {
      this.inflight--;
      Object.keys(old).forEach(id => { const o = old[id]; if (o === undefined) delete last.exp[id]; else last.exp[id] = o; });
      if (metaChanged) last.meta = oldMeta; this.saveLast();
      this.setStatus("error", syncMessage(e)); this.schedulePush(20000);
    });
  }

  /* ---- première synchronisation après connexion : fusion locale ↔ cloud ---- */
  private maybeStart(force: boolean): void {
    if (this.ready || !this.user || !this.firstExp || !this.firstMeta) return;
    if (!force && (this.firstExp.fromCache || this.firstMeta.fromCache)) return;
    clearTimeout(this.timer); this.handshake(this.firstExp, this.firstMeta);
  }
  private handshake(ex: ExpensesEvent, me: MetaEvent): void {
    this.applying = true;
    const l = this.last.exp, cloud = new Map(ex.docs.map(d => [String(d.id), d.data] as const));
    this.host.applyRemote(s => {
      const wasPristine = isPristine(s);                  // appareil neuf : on prend les réglages du cloud tels quels
      const keep: Expense[] = [], seen = new Set<string>();
      s.expenses.forEach(x => {
        const id = String(x.id), c = cloud.get(id), lj = expJson(x);
        if (!c) { if (l[id] === undefined) keep.push(x); else delete l[id]; }           // nouveau ici → sera envoyé ; sinon supprimé ailleurs
        else {
          seen.add(id); const cj = stable(expData(c));
          if (lj === cj) { keep.push(x); l[id] = cj; }
          else if (l[id] !== undefined && l[id] !== lj) keep.push(x);                    // modifié ici hors ligne → sera envoyé
          else { keep.push({ id: x.id, ...expData(c) }); l[id] = cj; }
        }
      });
      cloud.forEach((c, id) => {
        if (seen.has(id) || l[id] !== undefined) return;                                 // supprimé ici hors ligne → la suppression sera envoyée
        keep.push({ id: toId(id), ...expData(c) }); l[id] = stable(expData(c));
      });
      let next: AppState = { ...s, expenses: keep };
      const lm = stable(metaOf(next));
      if (me.exists && me.data) {
        const cm = normMeta(me.data), cj = stable(cm);
        const takeCloud = (): void => { next = { ...next, ...cm }; this.last.meta = cj; };
        const merged = (): void => { next = { ...next, ...mergeMeta(metaOf(next), cm) }; };
        if (lm === cj) this.last.meta = cj;
        else if (this.last.meta !== null && this.last.meta !== undefined) {
          const localChanged = lm !== this.last.meta, cloudChanged = cj !== this.last.meta;
          if (cloudChanged && !localChanged) takeCloud(); else if (cloudChanged && localChanged) merged();
          /* sinon : seulement local → sera envoyé */
        } else if (wasPristine) takeCloud(); else merged();
      }
      return next;
    });
    this.saveLast(); this.applying = false; this.ready = true;
    this.setStatus("synced"); this.schedulePush(0);
  }

  /* ---- changements venus des autres appareils ---- */
  private onExpenses = (ev: ExpensesEvent): void => {
    if (!this.ready) { this.firstExp = ev; this.maybeStart(false); return; }
    const last = this.last.exp;
    this.applying = true;
    this.host.applyRemote(s => {
      let list = s.expenses, changed = false;
      ev.changes.forEach(c => {
        if (c.pending) return;
        const id = String(c.id), i = list.findIndex(x => String(x.id) === id);
        if (c.type === "removed") { if (i >= 0) { list = list.filter((_, k) => k !== i); changed = true; } delete last[id]; return; }
        const j = stable(expData(c.data));
        if (i >= 0 && expJson(list[i]) === j) { last[id] = j; return; }
        const x: Expense = { id: toId(id), ...expData(c.data) };
        list = i >= 0 ? list.map((e, k) => (k === i ? x : e)) : list.concat(x);
        last[id] = j; changed = true;
      });
      return changed ? { ...s, expenses: list } : s;
    });
    this.applying = false; this.saveLast();
  };
  private onMeta = (ev: MetaEvent): void => {
    if (!this.ready) { this.firstMeta = ev; this.maybeStart(false); return; }
    if (ev.pending || !ev.exists || !ev.data) return;
    const c = normMeta(ev.data), cj = stable(c);
    if (cj === stable(metaOf(this.host.getState()))) { this.last.meta = cj; this.saveLast(); return; }
    this.last.meta = cj; this.applying = true;
    this.host.applyRemote(s => ({ ...s, ...c }));
    this.applying = false; this.saveLast();
  };

  /* ---- connexion ---- */
  private loadLast(uid: string): void {
    try { const s = JSON.parse(this.kv.get(SYNC_KEY) || "null") as LastSynced | null; this.last = s && s.uid === uid ? s : { uid, exp: {}, meta: null }; }
    catch { this.last = { uid, exp: {}, meta: null }; }
  }
  private saveLast(): void { this.kv.set(SYNC_KEY, JSON.stringify(this.last)); }
  private resetLocal(): void { this.applying = true; this.host.applyRemote(s => ({ ...freshState(), theme: s.theme, fx: s.fx })); this.applying = false; }

  private onUser(u: CloudUser | null): void {
    this.unsub?.(); this.unsub = null; clearTimeout(this.timer);
    this.ready = false; this.firstExp = this.firstMeta = null; this.user = u;
    if (!u) { this.setStatus("signedout"); return; }
    const owner = this.kv.get(OWNER_KEY);
    if (owner && owner !== u.uid) this.resetLocal();      // données locales d'un autre compte : on ne les mélange pas
    this.kv.set(OWNER_KEY, u.uid); this.loadLast(u.uid); this.setStatus("connecting");
    this.unsub = this.be!.listen(u.uid, { onExpenses: this.onExpenses, onMeta: this.onMeta, onError: e => this.setStatus("error", syncMessage(e)) });
    this.timer = setTimeout(() => this.maybeStart(true), this.handshakeDelay);
  }

  private async guard(fn: () => Promise<void>): Promise<Result> {
    try { await fn(); return { ok: true }; } catch (e) { return { ok: false, message: authMessage(e) }; }
  }
  google = (): Promise<Result> => this.guard(async () => {
    try { await this.be!.signInGoogle(); }
    catch (e) { if ((e as { code?: string }).code === "auth/popup-blocked" && this.be!.signInGoogleRedirect) await this.be!.signInGoogleRedirect(); else throw e; }
  });
  login = (email: string, pw: string): Promise<Result> => this.guard(() => this.be!.signInEmail(email, pw));
  signup = (email: string, pw: string): Promise<Result> => this.guard(() => this.be!.signUpEmail(email, pw));
  reset = (email: string): Promise<Result> => this.guard(() => this.be!.resetPassword(email));
  /** Retire les données de CET appareil et se déconnecte (elles restent dans le compte cloud). */
  async logout(): Promise<void> {
    this.resetLocal(); this.kv.del(OWNER_KEY); this.kv.del(SYNC_KEY);
    this.last = { uid: null, exp: {}, meta: null };
    await this.be?.signOut();
  }
}
