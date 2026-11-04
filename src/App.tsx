import { useEffect, useMemo, useRef, useState } from "react";
import type { Tab } from "./types";
import { actions, store, useAppState } from "./store";
import { iso, resolveTheme, weekStartOf } from "./lib/dates";
import { weekNumber } from "./lib/budget";
import { THEMES } from "./theme";
import { ToastProvider, useToast } from "./components/Toasts";
import { Modal } from "./components/Modal";
import { ParticlesLayer } from "./components/ParticlesLayer";
import { CloudChip, LoginDialogContent, useCloud } from "./components/CloudUI";
import { BudgetDialog, ExpenseDialog } from "./components/Dialogs";
import { WeekView } from "./views/WeekView";
import { ExpensesView } from "./views/ExpensesView";
import { SummaryView } from "./views/SummaryView";
import { SettingsView } from "./views/SettingsView";
import type { Backend } from "./sync/types";

type DialogState = null | { kind: "expense"; id: number } | { kind: "budget" } | { kind: "login" };
const TABS: { key: Tab; label: string }[] = [{ key: "week", label: "Semaine" }, { key: "exp", label: "Dépenses" }, { key: "sum", label: "Résumé annuel" }, { key: "set", label: "Réglages" }];

function Shell() {
  const state = useAppState(), toast = useToast(), cloud = useCloud();
  const [tab, setTab] = useState<Tab>("week");
  const [wk, setWk] = useState(() => iso(weekStartOf(new Date(), store.getState().payDay)));
  const [year, setYear] = useState(() => weekNumber(new Date(), store.getState().payDay).year);
  const [draft, setDraft] = useState({ cat: "", date: "" });
  const [dialog, setDialog] = useState<DialogState>(null);

  /* thème : la saison réelle si « 4 saisons » */
  const themeKey = resolveTheme(state.theme);
  useEffect(() => {
    const r = document.documentElement; r.setAttribute("data-theme", themeKey); r.setAttribute("data-fx", state.fx === false ? "off" : "on");
  }, [themeKey, state.fx]);
  useEffect(() => {      // en mode « 4 saisons », re-vérifier la saison au retour sur l'onglet
    if (state.theme !== "auto") return;
    const h = (): void => { if (!document.hidden) { const k = resolveTheme("auto"); document.documentElement.setAttribute("data-theme", k); } };
    document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h);
  }, [state.theme]);

  /* le jour de paie peut changer (ici ou sur un autre appareil) : réaligner la semaine affichée */
  useEffect(() => { setWk(w => iso(weekStartOf(new Date(w + "T00:00:00"), state.payDay))); }, [state.payDay]);

  /* proposer la connexion une fois par session */
  const asked = useRef(false);
  useEffect(() => {
    if (cloud.status === "signedout" && !asked.current) { asked.current = true; const t = setTimeout(() => setDialog(d => d ?? { kind: "login" }), 400); return () => clearTimeout(t); }
    if (cloud.user) setDialog(d => (d && d.kind === "login" ? null : d));
  }, [cloud.status, cloud.user]);

  const deleteExpense = (id: number): void => {
    const x = actions.removeExpense(id); setDialog(null);
    if (x) toast("Dépense supprimée.", { label: "Annuler", fn: () => actions.restoreExpense(x) });
  };
  const curWk = useMemo(() => iso(weekStartOf(new Date(), state.payDay)), [state.payDay]);
  const close = (): void => setDialog(null);

  return (
    <>
      <header className="top"><div className="top-in">
        <CloudChip onClick={() => { if (cloud.status === "signedout") setDialog({ kind: "login" }); else { setTab("set"); window.scrollTo(0, 0); } }} />
        <h1><span id="logo">{THEMES[themeKey].emoji}</span> Budget loisirs hebdo</h1>
        <p>Suis tes dépenses semaine après semaine</p>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(t => <button key={t.key} className={"tab" + (tab === t.key ? " on" : "")} onClick={() => { setTab(t.key); window.scrollTo(0, 0); }}>{t.label}</button>)}
        </nav>
      </div></header>

      <main id="app">
        {tab === "week" && <WeekView state={state} wk={wk} setWk={setWk} themeKey={themeKey} draft={draft} setDraft={setDraft}
          onEditBudget={() => setDialog({ kind: "budget" })} onEditExpense={id => setDialog({ kind: "expense", id })} onDeleteExpense={deleteExpense} />}
        {tab === "exp" && <ExpensesView state={state} onEdit={id => setDialog({ kind: "expense", id })} onDelete={deleteExpense} />}
        {tab === "sum" && <SummaryView state={state} year={year} setYear={setYear} setWk={setWk} goWeek={() => { setTab("week"); window.scrollTo(0, 0); }} themeKey={themeKey} />}
        {tab === "set" && <SettingsView state={state} curWk={curWk} onErased={() => { setWk(curWk); }} />}
      </main>

      <Modal open={dialog !== null} onClose={close}>
        {dialog?.kind === "expense" && <ExpenseDialog state={state} id={dialog.id} onClose={close} />}
        {dialog?.kind === "budget" && <BudgetDialog state={state} wk={wk} onClose={close} />}
        {dialog?.kind === "login" && <LoginDialogContent onClose={close} />}
      </Modal>
      <ParticlesLayer theme={themeKey} enabled={state.fx !== false} />
    </>
  );
}

let cloudStarted = false;   // une seule initialisation, même si React (mode strict) exécute l'effet deux fois en développement
export function App({ backend, firebaseConfig }: { backend?: Backend; firebaseConfig?: Record<string, string | undefined> | null }) {
  useEffect(() => { if (cloudStarted) return; cloudStarted = true; void store.cloud.init(firebaseConfig ?? null, backend); }, [backend, firebaseConfig]);
  return <ToastProvider><Shell /></ToastProvider>;
}
