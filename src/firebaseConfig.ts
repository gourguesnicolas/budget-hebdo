/*
 * Paramètres de ton projet Firebase, lus depuis les variables d'environnement Vite (voir LISEZ-MOI.md, étape 3).
 * Ces valeurs ne sont PAS secrètes : elles identifient seulement ton projet.
 * Ce qui protège tes données, ce sont la connexion et les règles Firestore (firestore.rules).
 * Sans configuration, l'app fonctionne en mode local uniquement.
 */
const e = import.meta.env;
export const firebaseConfig: Record<string, string | undefined> | null = e.VITE_FIREBASE_API_KEY
  ? {
      apiKey: e.VITE_FIREBASE_API_KEY,
      authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: e.VITE_FIREBASE_PROJECT_ID,
      storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: e.VITE_FIREBASE_APP_ID
    }
  : null;
