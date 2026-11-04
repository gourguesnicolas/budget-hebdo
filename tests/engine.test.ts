/* Tests du moteur de synchronisation : deux « appareils » + un faux Firestore en mémoire (aucun navigateur requis). */
import type { AppState } from "../src/types";
import { freshState } from "../src/lib/budget";
import { CloudSync, expData, type KV } from "../src/sync/engine";
import type { Backend, CloudUser, ExpenseData, ExpensesEvent, ListenHandlers, MetaData, MetaEvent, WriteBatch } from "../src/sync/types";

/* ---- faux cloud partagé ---- */
class FakeCloud {
  users: Record<string, { exp: Map<string, ExpenseData>; meta: MetaData | null }> = {};
  subs = new Set<{ uid: string; h: ListenHandlers; known: Map<string, string>; metaJ: string | null | undefined }>();
  fail = false; writes: WriteBatch[] = [];
  u(uid: string) { return (this.users[uid] ??= { exp: new Map(), meta: null }); }
  /** diffuse l'état courant à tous les abonnés (comme onSnapshot) */
  pump(): void {
    for (const s of this.subs) {
      const U = this.u(s.uid), changes: ExpensesEvent["changes"] = [];
      for (const [id, d] of U.exp) { const j = JSON.stringify(d); if (!s.known.has(id)) changes.push({ type: "added", id, data: d, pending: false }); else if (s.known.get(id) !== j) changes.push({ type: "modified", id, data: d, pending: false }); }
      for (const id of s.known.keys()) if (!U.exp.has(id)) changes.push({ type: "removed", id, data: {} as ExpenseData, pending: false });
      if (changes.length || s.metaJ === undefined) {
        s.known = new Map([...U.exp].map(([id, d]) => [id, JSON.stringify(d)]));
        s.h.onExpenses({ docs: [...U.exp].map(([id, data]) => ({ id, data })), changes, fromCache: false });
      }
      const mj = JSON.stringify(U.meta);
      if (mj !== s.metaJ) { s.metaJ = mj; s.h.onMeta({ exists: !!U.meta, data: U.meta ?? undefined, fromCache: false, pending: false } as MetaEvent); }
    }
  }
}
function makeBackend(cloud: FakeCloud): Backend & { signIn(u: CloudUser | null): void } {
  let authCb: ((u: CloudUser | null) => void) | null = null;
  return {
    onAuth(cb) { authCb = cb; return () => { authCb = null; }; },
    signIn(u) { authCb?.(u); },
    async signInGoogle() {}, async signInEmail() {}, async signUpEmail() {}, async resetPassword() {},
    async signOut() { authCb?.(null); },
    listen(uid, h) { const sub = { uid, h, known: new Map<string, string>(), metaJ: undefined as string | null | undefined }; cloud.subs.add(sub); setTimeout(() => cloud.pump(), 0); return () => { cloud.subs.delete(sub); }; },
    async write(w) {
      if (cloud.fail) throw Object.assign(new Error("denied"), { code: "permission-denied" });
      cloud.writes.push(w);
      const uid = (cloud as unknown as { cur?: string }).cur!;
      const U = cloud.u(uid);
      w.sets.forEach(x => U.exp.set(x.id, x.data)); w.dels.forEach(id => U.exp.delete(id)); if (w.meta) U.meta = JSON.parse(JSON.stringify(w.meta));
      setTimeout(() => cloud.pump(), 0);
    }
  };
}

/* ---- un appareil ---- */
interface Device { name: string; st: AppState; sync: CloudSync; be: ReturnType<typeof makeBackend>; mem: Map<string, string> }
function device(cloud: FakeCloud, name: string, initial?: AppState): Device {
  const mem = new Map<string, string>();
  const kv: KV = { get: k => mem.get(k) ?? null, set: (k, v) => { mem.set(k, v); }, del: k => { mem.delete(k); } };
  const d = { name, st: initial ?? freshState(), mem } as Device;
  d.sync = new CloudSync({ getState: () => d.st, applyRemote: fn => { d.st = fn(d.st); } }, { handshakeTimeoutMs: 300, kv });
  d.be = makeBackend(cloud);
  return d;
}
const local = (d: Device, fn: (s: AppState) => AppState): void => { d.st = fn(d.st); d.sync.notifyLocalChange(); };
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (name: string, cond: boolean, extra?: unknown): void => { if (cond) passes++; else { fails++; console.log("FAIL", name, extra ?? ""); } };
const descs = (d: Device): string => d.st.expenses.map(x => x.desc).sort().join(",");
const cloudDescs = (c: FakeCloud, uid: string): string => [...c.u(uid).exp.values()].map(x => x.desc).sort().join(",");
const exp = (id: number, desc: string, amount = 10) => ({ id, date: "2026-10-08", amount, desc, cat: "Autre" });
const settle = async (c: FakeCloud, cur: string): Promise<void> => { (c as unknown as { cur: string }).cur = cur; await sleep(900); c.pump(); await sleep(200); };

async function main(): Promise<void> {

  /* 1. Appareil A avec des données locales existantes se connecte (cloud vide) */
  const cloud = new FakeCloud();
  const A = device(cloud, "A", { ...freshState(), payDay: 4, defaults: [{ from: "2026-10-01", amount: 60 }], weeks: { "2026-10-08": { budget: 80 } }, categories: ["Café", "Autre"], expenses: [exp(1, "A1"), exp(2, "A2"), exp(3, "A3")] });
  await A.sync.init(null, A.be); A.be.signIn({ uid: "u1", email: "a@x.ca" }); await settle(cloud, "u1");
  check("A synchronisé", A.sync.getSnapshot().status === "synced", A.sync.getSnapshot());
  check("cloud reçoit 3 dépenses de A", cloudDescs(cloud, "u1") === "A1,A2,A3", cloudDescs(cloud, "u1"));
  check("cloud reçoit budgets/catégories/jour de paie", cloud.u("u1").meta?.payDay === 4 && cloud.u("u1").meta?.defaults.length === 1 && cloud.u("u1").meta?.categories.length === 2);
  check("A garde ses 3 dépenses", descs(A) === "A1,A2,A3");

  /* 2. Appareil B neuf : reçoit tout (réglages du cloud, pas les catégories par défaut) */
  const B = device(cloud, "B");
  await B.sync.init(null, B.be); B.be.signIn({ uid: "u1", email: "a@x.ca" }); await settle(cloud, "u1");
  check("B reçoit les dépenses de A", descs(B) === "A1,A2,A3", descs(B));
  check("B reçoit budget par défaut + budget de semaine", B.st.defaults.length === 1 && B.st.weeks["2026-10-08"]?.budget === 80);
  check("B prend les catégories du cloud (2, pas les 8 par défaut)", B.st.categories.length === 2, B.st.categories);

  /* 3. B ajoute → A voit (sans rechargement) */
  local(B, s => ({ ...s, expenses: [...s.expenses, exp(4, "B1", 17.5)] })); await settle(cloud, "u1");
  check("B→A : A voit B1", descs(A) === "A1,A2,A3,B1", descs(A));

  /* 4. A supprime A2 → B voit disparaître */
  local(A, s => ({ ...s, expenses: s.expenses.filter(x => x.desc !== "A2") })); await settle(cloud, "u1");
  check("A→B : suppression", descs(B) === "A1,A3,B1", descs(B)); check("cloud sans A2", !cloudDescs(cloud, "u1").includes("A2"));

  /* 5. modification */
  local(A, s => ({ ...s, expenses: s.expenses.map(x => (x.desc === "A1" ? { ...x, amount: 99 } : x)) })); await settle(cloud, "u1");
  check("modif A→B", B.st.expenses.find(x => x.desc === "A1")?.amount === 99);

  /* 6. ajouts simultanés des deux appareils : rien ne s'écrase */
  local(A, s => ({ ...s, expenses: [...s.expenses, exp(10, "A-sim")] })); local(B, s => ({ ...s, expenses: [...s.expenses, exp(11, "B-sim")] }));
  await settle(cloud, "u1"); await settle(cloud, "u1");
  check("ajouts simultanés conservés des deux côtés", descs(A) === descs(B) && descs(A).includes("A-sim") && descs(A).includes("B-sim"), [descs(A), descs(B)]);

  /* 7. jour de paie et budget : A→B */
  local(A, s => ({ ...s, payDay: 1, weeks: {}, defaults: [{ from: "2026-09-28", amount: 70 }] })); await settle(cloud, "u1");
  check("réglages A→B", B.st.payDay === 1 && B.st.defaults[0]?.amount === 70, [B.st.payDay, B.st.defaults]);

  /* 8. B hors ligne (fermé) pendant qu'A supprime : pas de résurrection à la reconnexion */
  const snapB = JSON.stringify(B.st), memB = new Map(B.mem); B.sync.dispose();
  const victim = A.st.expenses.find(x => x.desc === "A3")!;
  local(A, s => ({ ...s, expenses: s.expenses.filter(x => x.id !== victim.id) })); await settle(cloud, "u1");
  const B2 = device(cloud, "B2", JSON.parse(snapB) as AppState); memB.forEach((v, k) => B2.mem.set(k, v));
  await B2.sync.init(null, B2.be); B2.be.signIn({ uid: "u1", email: "a@x.ca" }); await settle(cloud, "u1");
  check("A3 supprimé ailleurs n'est pas ressuscité (B2)", !descs(B2).includes("A3") && !cloudDescs(cloud, "u1").includes("A3"), [descs(B2), cloudDescs(cloud, "u1")]);

  /* 9. B2 supprime hors ligne, A modifie ailleurs → la suppression l'emporte sans erreur ; B2 ajoute hors ligne → envoyé */
  const B3state = JSON.parse(JSON.stringify(B2.st)) as AppState; const memB2 = new Map(B2.mem); B2.sync.dispose();
  B3state.expenses = B3state.expenses.filter(x => x.desc !== "B1"); B3state.expenses.push(exp(20, "B-offline"));
  const B3 = device(cloud, "B3", B3state); memB2.forEach((v, k) => B3.mem.set(k, v));
  await B3.sync.init(null, B3.be); B3.be.signIn({ uid: "u1", email: "a@x.ca" }); await settle(cloud, "u1");
  check("suppression + ajout faits hors ligne propagés", !cloudDescs(cloud, "u1").includes("B1") && cloudDescs(cloud, "u1").includes("B-offline"), cloudDescs(cloud, "u1"));
  check("A reçoit B-offline", descs(A).includes("B-offline") && !descs(A).includes("B1"), descs(A));

  /* 10. déconnexion : données locales retirées, cloud intact ; autre compte : pas de mélange */
  const before = cloudDescs(cloud, "u1");
  await A.sync.logout(); await settle(cloud, "u1");
  check("A déconnecté : local vide", A.st.expenses.length === 0 && A.mem.get("budget-hebdo-owner-v1") === undefined);
  check("cloud intact après déconnexion", cloudDescs(cloud, "u1") === before);
  A.be.signIn({ uid: "u2", email: "b@x.ca" }); await settle(cloud, "u2");
  check("compte u2 vide : aucun mélange", A.st.expenses.length === 0 && cloudDescs(cloud, "u2") === "", descs(A));
  await A.sync.logout(); A.be.signIn({ uid: "u1", email: "a@x.ca" }); await settle(cloud, "u1");
  check("reconnexion u1 : retrouve tout", descs(A) === before, [descs(A), before]);

  /* 11. changement de compte sans déconnexion explicite (données d'un autre propriétaire) */
  A.be.signIn({ uid: "u2", email: "b@x.ca" }); await settle(cloud, "u2");
  check("changement direct u1→u2 : données u1 non copiées dans u2", cloudDescs(cloud, "u2") === "" && A.st.expenses.length === 0, [cloudDescs(cloud, "u2"), descs(A)]);

  /* 12. erreur d'écriture (règles refusées) : statut d'erreur, puis reprise */
  A.be.signIn({ uid: "u1", email: "a@x.ca" }); await settle(cloud, "u1");
  cloud.fail = true; local(A, s => ({ ...s, expenses: [...s.expenses, exp(30, "fail-1")] })); await sleep(900);
  check("écriture refusée → statut erreur", A.sync.getSnapshot().status === "error" && /Accès refusé/.test(A.sync.getSnapshot().errMsg), A.sync.getSnapshot());
  cloud.fail = false; local(A, s => ({ ...s, expenses: [...s.expenses] })); A.sync.notifyLocalChange(); await sleep(21500);
  check("reprise automatique après erreur", cloudDescs(cloud, "u1").includes("fail-1") && A.sync.getSnapshot().status === "synced", [cloudDescs(cloud, "u1"), A.sync.getSnapshot().status]);

  /* 13. expData normalise les types */
  check("expData normalise", JSON.stringify(expData({ amount: "5", date: "2026-01-01" })) === JSON.stringify({ amount: 5, date: "2026-01-01", desc: "", cat: "" }));

  console.log(`\n${passes} réussis, ${fails} échoués`);
  process.exit(fails ? 1 : 0);
}
void main();
