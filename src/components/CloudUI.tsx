import { useState, useSyncExternalStore, type FormEvent } from "react";
import { store } from "../store";
import type { CloudSnapshot } from "../sync/types";
import { useToast } from "./Toasts";
import googleG from "../assets/google-g.svg";

export const useCloud = (): CloudSnapshot => useSyncExternalStore(store.cloud.subscribe, store.cloud.getSnapshot);

export function chipLabel(c: CloudSnapshot): { text: string; cls: string } | null {
  switch (c.status) {
    case "off": return null;
    case "connecting": return { text: "☁ Connexion…", cls: "" };
    case "signedout": return { text: "☁ Se connecter", cls: "warn" };
    case "error": return { text: "⚠ Synchro en erreur", cls: "err" };
    default: return c.online ? { text: c.inflight > 0 ? "☁ Synchronisation…" : "☁ Synchronisé", cls: "" } : { text: "☁ Hors ligne", cls: "" };
  }
}
export function CloudChip({ onClick }: { onClick: () => void }) {
  const c = useCloud(), l = chipLabel(c);
  return (
    <button id="cloudchip" type="button" className={"cloudchip" + (l ? " show " + l.cls : "")} onClick={onClick}
      title={c.status === "error" ? c.errMsg : c.user ? "Compte : " + (c.user.email ?? "") : ""}>{l?.text}</button>
  );
}

export function LoginForm() {
  const toast = useToast();
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [busy, setBusy] = useState(false);
  const run = async (p: Promise<{ ok: boolean; message?: string }>, okMsg?: string): Promise<void> => {
    setBusy(true); const r = await p; setBusy(false);
    if (!r.ok) toast("⚠ " + (r.message ?? "Échec")); else if (okMsg) toast(okMsg);
  };
  const submit = (e: FormEvent): void => { e.preventDefault(); void run(store.cloud.login(email.trim(), pw)); };
  const signup = (): void => {
    if (!email.trim() || pw.length < 6) { toast("⚠ Entre un courriel et un mot de passe d'au moins 6 caractères."); return; }
    void run(store.cloud.signup(email.trim(), pw));
  };
  return (
    <form data-form="cloudlogin" className="loginform" onSubmit={submit}>
      <label>Courriel<input name="email" type="email" autoComplete="username" placeholder="mon@courriel.com" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Mot de passe<input name="password" type="password" autoComplete="current-password" placeholder="••••••••" minLength={6} required value={pw} onChange={e => setPw(e.target.value)} /></label>
      <button className="btn" disabled={busy}>Se connecter</button>
      <button type="button" className="btn ghost" disabled={busy} onClick={signup}>Créer le compte</button>
      <button type="button" className="gbtn" disabled={busy} onClick={() => void run(store.cloud.google())}>
        <img src={googleG} alt="" width={20} height={20} />Continuer avec Google
      </button>
      <a href="#" className="forgot" onClick={e => {
        e.preventDefault();
        if (!email.trim()) { toast("Entre d'abord ton courriel."); return; }
        void run(store.cloud.reset(email.trim()), "Courriel de réinitialisation envoyé (vérifie aussi tes pourriels).");
      }}>Mot de passe oublié ?</a>
    </form>
  );
}

export function LoginDialogContent({ onClose }: { onClose: () => void }) {
  return (
    <>
      <h3>☁ Synchroniser mes dépenses</h3>
      <p className="hint">Connecte-toi pour retrouver tes données sur tous tes appareils. Ce que tu as déjà saisi sur cet appareil sera ajouté à ton compte.</p>
      <LoginForm />
      <div className="flex" style={{ marginTop: 12, justifyContent: "flex-end" }}><button type="button" className="btn ghost" onClick={onClose}>Plus tard</button></div>
    </>
  );
}

export function CloudCard() {
  const c = useCloud();
  const logout = (): void => {
    const warn = store.cloud.hasPending ? "\n\n⚠ Des changements ne sont peut-être pas encore envoyés : reconnecte-toi en ligne d'abord." : "";
    if (confirm("Se déconnecter ?\n\nLes données seront retirées de CET appareil (elles restent dans ton compte cloud et reviendront à la prochaine connexion)." + warn)) void store.cloud.logout();
  };
  let body;
  if (c.status === "off") {
    body = c.reason === "file"
      ? <p>La synchronisation fonctionne quand l'application est ouverte depuis son adresse web (GitHub Pages), pas depuis un fichier sur l'ordinateur.</p>
      : <p>La synchronisation cloud n'est pas encore activée. Suis le guide <b>LISEZ-MOI.md</b> pour créer ton projet Firebase, puis renseigne ses paramètres (fichier <code>.env.local</code>).</p>;
  } else if (c.status === "error" && !c.user) {
    body = <p className="msg bad">{c.errMsg}</p>;
  } else if (!c.user) {
    body = <><p>{c.status === "connecting" ? "Connexion en cours…" : "Connecte-toi pour retrouver tes données sur tous tes appareils."}</p>{c.status !== "connecting" && <LoginForm />}</>;
  } else {
    const t = c.status === "error" ? <span style={{ color: "var(--danger)" }}>{c.errMsg}</span>
      : !c.online ? "hors ligne (les changements seront envoyés au retour du réseau)" : c.status === "connecting" ? "connexion…" : "synchronisé en direct";
    body = (
      <>
        <p>Connecté : <b>{c.user.email ?? "compte"}</b> · {t}</p>
        <div className="flex"><button className="btn ghost" onClick={logout}>Se déconnecter</button></div>
        <p className="hint" style={{ marginBottom: 0 }}>Tes dépenses et budgets sont enregistrés dans ton compte et partagés entre tes appareils. L'app continue de fonctionner hors ligne et se resynchronise ensuite.</p>
      </>
    );
  }
  return <div className="card"><h2>Synchronisation cloud</h2>{body}</div>;
}
