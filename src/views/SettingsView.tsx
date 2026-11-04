import { useState, type FormEvent } from "react";
import type { AppState, ThemeChoice } from "../types";
import { budgetFor } from "../lib/budget";
import { DAYS, fm, iso, parse, seasonOf, shortDate } from "../lib/dates";
import { storageOK } from "../lib/storage";
import { actions, store } from "../store";
import { THEMES } from "../theme";
import { CloudCard } from "../components/CloudUI";
import { useToast } from "../components/Toasts";
import { parseAmount } from "../components/Dialogs";

function download(name: string, text: string, type: string): void {
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsView({ state, curWk, onErased }: { state: AppState; curWk: string; onErased: () => void }) {
  const toast = useToast(), [newCat, setNewCat] = useState("");
  const real = seasonOf(new Date());
  const tile = (k: ThemeChoice, label: string, sub: string, sw: string[], em: string) => (
    <button key={k} className={"theme-tile" + (state.theme === k ? " on" : "")} aria-pressed={state.theme === k} onClick={() => actions.setTheme(k)}>
      <span className="sw">{sw.map(c => <i key={c} style={{ background: c }} />)}</span><b>{em} {label}</b><span className="hint">{sub}</span>
    </button>
  );
  const exportJson = (): void => {
    actions.markExported();
    download("budget-hebdo-" + iso(new Date()) + ".json", JSON.stringify(store.getState(), null, 2), "application/json");
  };
  const exportCsv = (): void => {
    const q = (v: string | number): string => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = [["Date", "Montant", "Description", "Catégorie"].map(q).join(";")].concat(
      state.expenses.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map(x => [x.date, String(x.amount).replace(".", ","), x.desc, x.cat].map(q).join(";")));
    download("depenses-" + iso(new Date()) + ".csv", "﻿" + rows.join("\r\n"), "text/csv;charset=utf-8");
  };
  const importFile = (f: File | undefined): void => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const raw = String(r.result);
      let n = 0; try { const j = JSON.parse(raw) as { expenses?: unknown[] }; n = Array.isArray(j.expenses) ? j.expenses.length : 0; } catch { n = 0; }
      if (!n && !/"expenses"\s*:\s*\[\s*\]/.test(raw)) { toast("⚠ Fichier invalide : choisis une sauvegarde JSON exportée par cette application."); return; }
      if (!confirm(`Remplacer tes données actuelles par cette sauvegarde (${n} dépenses) ?` + (store.cloud.getSnapshot().user ? "\n\nTes données du cloud (et de tes autres appareils) seront aussi remplacées." : ""))) return;
      toast(actions.importJson(raw) == null ? "⚠ Fichier invalide : choisis une sauvegarde JSON exportée par cette application." : "Sauvegarde importée.");
    };
    r.readAsText(f);
  };
  const erase = (): void => {
    if (!confirm("Effacer TOUTES tes données (budgets et dépenses) ? Cette action est irréversible" + (store.cloud.getSnapshot().user ? " : elles seront aussi effacées de ton compte cloud et de tes autres appareils" : "") + ".\n\nAs-tu fait une sauvegarde ?")) return;
    actions.eraseAll(); onErased(); toast("Toutes les données ont été effacées.");
  };
  const saveDefault = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault(); const a = parseAmount(new FormData(e.currentTarget).get("amount"));
    if (!(a >= 0)) { toast("⚠ Montant invalide."); return; }
    actions.setDefaultBudget(curWk, a); toast("Budget par défaut mis à jour à partir de cette semaine.");
  };
  const cur = budgetFor(state, curWk);

  return (
    <>
      <div className="card"><h2>Thème</h2>
        <div className="theme-tiles">
          {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map(k => tile(k, THEMES[k].label, THEMES[k].sub, THEMES[k].sw, THEMES[k].emoji))}
          {tile("auto", "4 saisons", "Suit la saison en cours · actuellement : " + THEMES[real].label.toLowerCase(), ["#D9641E", "#0A8794", "#D63F7E", "#1F8A5B"], "🔄")}
        </div>
        <label className="chk"><input type="checkbox" checked={state.fx !== false} onChange={e => actions.setFx(e.target.checked)} /> Particules animées sur toute la page (feuilles, neige, pétales, bulles…) qui réagissent doucement au curseur</label>
        <p className="hint" style={{ marginBottom: 0 }}>« 4 saisons » suit la date de ton ordinateur (hémisphère nord) : printemps dès le 20 mars, été dès le 21 juin, automne dès le 22 septembre, hiver dès le 21 décembre.</p></div>

      <CloudCard />

      <div className="card"><h2>Jour de paie</h2>
        <p className="hint">Chaque semaine de budget commence le jour où tu reçois ta paie et se termine la veille de la suivante (ex. jeudi → mercredi).</p>
        <label>Je reçois ma paie le <select value={state.payDay} onChange={e => { actions.setPayDay(Number(e.target.value)); toast("Jour de paie : " + DAYS[Number(e.target.value)] + ". Les semaines ont été ajustées."); }}>
          {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{DAYS[d]}</option>)}</select></label>
        <p className="hint" style={{ marginBottom: 0 }}>Si tu changes ce jour, tes semaines et budgets existants sont déplacés vers les nouvelles semaines (tes dépenses ne bougent pas).</p></div>

      <div className="card"><h2>Budget par défaut</h2>
        <p className="hint">Le nouveau montant s'applique à partir de la semaine en cours : tes semaines passées gardent leur budget d'origine.</p>
        <form className="addform" onSubmit={saveDefault} key={String(cur)}><label>Budget par semaine ($)<input name="amount" type="number" min="0" step="0.01" required inputMode="decimal" defaultValue={cur ?? ""} /></label><button className="btn">Enregistrer</button></form>
        {state.defaults.length > 0 && <ul className="hint" style={{ marginBottom: 0 }}>{state.defaults.slice().reverse().map(x => <li key={x.from}>depuis la semaine du {shortDate(parse(x.from))} {parse(x.from).getFullYear()} : <b>{fm(x.amount)}</b></li>)}</ul>}</div>

      <div className="card"><h2>Catégories</h2>
        <div>{state.categories.length ? state.categories.map((c, i) => (
          <span className="tag" key={c}>{c}<button className="icon" aria-label={"Retirer " + c} title="Retirer" onClick={() => actions.removeCategory(i)}>✕</button></span>
        )) : <span className="hint">Aucune catégorie.</span>}</div>
        <form className="addform" style={{ marginTop: 10 }} onSubmit={e => { e.preventDefault(); const n = newCat.trim(); if (!n) return; if (actions.addCategory(n)) setNewCat(""); else toast("Cette catégorie existe déjà."); }}>
          <label className="grow">Nouvelle catégorie<input maxLength={40} required value={newCat} onChange={e => setNewCat(e.target.value)} /></label><button className="btn">Ajouter</button></form>
        <p className="hint" style={{ marginBottom: 0 }}>Retirer une catégorie ne modifie pas les dépenses déjà saisies.</p></div>

      <div className="card"><h2>Sauvegarde de tes données</h2>
        <p>Tes données sont enregistrées <b>dans ce navigateur</b>{store.cloud.getSnapshot().user ? " et dans ton compte cloud" : ""}. Fais une sauvegarde de temps en temps.</p>
        <p className="hint">{state.lastExport ? "Dernière sauvegarde : " + new Date(state.lastExport).toLocaleDateString("fr-CA") + "." : "Aucune sauvegarde faite pour l'instant."}{storageOK ? "" : " ⚠ Le stockage du navigateur est indisponible."}</p>
        <div className="flex"><button className="btn" onClick={exportJson}>Exporter (JSON)</button><button className="btn ghost" onClick={exportCsv}>Exporter pour Excel (CSV)</button>
          <label className="btn ghost" style={{ flexDirection: "row", cursor: "pointer", color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>Importer une sauvegarde
            <input type="file" accept=".json,application/json" hidden onChange={e => { importFile(e.target.files?.[0]); e.target.value = ""; }} /></label></div></div>

      <div className="card"><h2>Zone sensible</h2><button className="btn danger" onClick={erase}>Effacer toutes mes données</button></div>
    </>
  );
}
