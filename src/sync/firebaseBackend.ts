/* Pont entre l'application et Firebase (Authentication + Firestore). Chargé seulement si la configuration est remplie. */
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, type User
} from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, writeBatch, serverTimestamp, type Firestore, type DocumentReference, type DocumentData
} from "firebase/firestore";
import type { Backend, CloudUser, ExpenseData, MetaData } from "./types";

const slim = (u: User | null): CloudUser | null => (u ? { uid: u.uid, email: u.email } : null);

export async function createFirebaseBackend(cfg: Record<string, string | undefined>): Promise<Backend> {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  auth.languageCode = "fr";
  let db: Firestore;
  try {   // cache hors ligne persistant (IndexedDB), partagé entre les onglets
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch { db = getFirestore(app); }

  const provider = (): GoogleAuthProvider => { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); return p; };
  const expCol = (uid: string) => collection(db, "users", uid, "expenses");
  const expDoc = (uid: string, id: string) => doc(db, "users", uid, "expenses", id);
  const metaRef = (uid: string) => doc(db, "users", uid, "meta", "settings");

  return {
    onAuth: cb => onAuthStateChanged(auth, u => cb(slim(u))),
    signInGoogle: async () => { await signInWithPopup(auth, provider()); },
    signInGoogleRedirect: async () => { await signInWithRedirect(auth, provider()); },
    signInEmail: async (e, p) => { await signInWithEmailAndPassword(auth, e, p); },
    signUpEmail: async (e, p) => { await createUserWithEmailAndPassword(auth, e, p); },
    resetPassword: e => sendPasswordResetEmail(auth, e),
    signOut: () => signOut(auth),

    listen(uid, h) {
      const u1 = onSnapshot(expCol(uid), snap => h.onExpenses({
        docs: snap.docs.map(d => ({ id: d.id, data: d.data() as ExpenseData })),
        changes: snap.docChanges().map(c => ({ type: c.type, id: c.doc.id, data: c.doc.data() as ExpenseData, pending: c.doc.metadata.hasPendingWrites })),
        fromCache: snap.metadata.fromCache
      }), h.onError);
      const u2 = onSnapshot(metaRef(uid), snap => h.onMeta({
        exists: snap.exists(), data: snap.data() as MetaData | undefined, fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites
      }), h.onError);
      return () => { u1(); u2(); };
    },

    async write({ sets, dels, meta }) {
      const uid = auth.currentUser?.uid; if (!uid) throw new Error("not-signed-in");
      type Op = { kind: "set"; ref: DocumentReference; data: DocumentData } | { kind: "del"; ref: DocumentReference };
      const ops: Op[] = [
        ...sets.map((s): Op => ({ kind: "set", ref: expDoc(uid, s.id), data: { ...s.data } })),
        ...dels.map((id): Op => ({ kind: "del", ref: expDoc(uid, id) }))
      ];
      if (meta) ops.push({ kind: "set", ref: metaRef(uid), data: { ...meta, updatedAt: serverTimestamp() } });
      for (let i = 0; i < ops.length; i += 400) {            // lots de 400 (limite Firestore : 500)
        const b = writeBatch(db);
        ops.slice(i, i + 400).forEach(o => (o.kind === "set" ? b.set(o.ref, o.data) : b.delete(o.ref)));
        await b.commit();
      }
    }
  };
}
