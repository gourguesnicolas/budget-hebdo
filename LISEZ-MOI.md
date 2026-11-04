# Budget loisirs hebdo — React + TypeScript + Firebase

Suivi de budget hebdomadaire (semaines qui commencent le jour de paie, jeudi par défaut), avec thèmes saisonniers,
particules animées et **synchronisation entre tes appareils** (PC, Mac, mobile) via Firebase.
Se déploie gratuitement sur **GitHub Pages**.

Sans configuration Firebase, l'app fonctionne quand même en **mode local** (données dans le navigateur).

---

## 1. Essayer en local

Prérequis : [Node.js](https://nodejs.org) 20.19 ou plus récent.

```bash
npm install
npm run dev          # ouvre http://localhost:5173
```

## 2. Créer le projet Firebase (≈ 10 min, gratuit)

1. Va sur <https://console.firebase.google.com> → **Ajouter un projet** (Google Analytics : tu peux le désactiver).
2. **Build → Authentication → Commencer**, puis onglet **Sign-in method** : active **Adresse e-mail/Mot de passe** et **Google**.
3. **Build → Firestore Database → Créer une base de données** : choisis la région `northamerica-northeast1` (Montréal), mode **production**.
4. Dans Firestore, onglet **Règles** : remplace tout par le contenu du fichier [`firestore.rules`](./firestore.rules), puis **Publier**.
   (Ces règles font que **chaque personne ne peut lire et écrire que ses propres données**.)
5. **Paramètres du projet (engrenage) → Tes applications → icône Web `</>`** : enregistre une application (pas besoin d'hébergement Firebase).
   Firebase affiche un objet `firebaseConfig` : garde cette page ouverte pour l'étape suivante.

## 3. Brancher l'app

Copie `.env.example` en **`.env.local`** et colle les valeurs :

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Relance `npm run dev` : l'app propose de te connecter (courriel + mot de passe, ou Google). La puce « ☁ » en haut à droite montre l'état de la synchronisation.

## 4. Déployer sur GitHub Pages

1. Crée un dépôt GitHub et pousse ce dossier sur la branche `main` (pense à commiter le `package-lock.json` créé par `npm install`).
2. Dépôt → **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Dépôt → **Settings → Secrets and variables → Actions → onglet Variables** : ajoute les 6 variables `VITE_FIREBASE_*` (mêmes valeurs que `.env.local`).
   Ce sont des *variables* (pas des secrets) : ces valeurs identifient seulement ton projet, elles ne protègent rien.
4. Chaque `git push` sur `main` reconstruit et publie le site (onglet **Actions** pour suivre). Adresse : `https://<ton-nom>.github.io/<nom-du-depot>/`.
5. **Important** : dans Firebase → **Authentication → Settings → Authorized domains**, ajoute `<ton-nom>.github.io`
   (sinon la connexion échoue avec « unauthorized-domain »).

## 5. Reprendre tes données de l'ancienne version (fichier `budget-hebdo.html`)

Les données de l'ancien fichier sont dans le navigateur, liées à ce fichier : elles ne suivent pas toutes seules.

1. Ouvre l'**ancienne** version → **Réglages → Exporter (JSON)**.
2. Ouvre le **nouveau** site, connecte-toi (compte vide), puis **Réglages → Importer une sauvegarde**.
3. Les données partent dans ton compte : tu les retrouves sur tous tes appareils. (Les anciennes sauvegardes aux semaines du lundi sont converties aux semaines de paie.)

## Sécurité — ce qu'il faut savoir

- **La configuration Firebase n'est pas secrète** (elle est visible dans le code du site, c'est normal). La protection vient de la **connexion** et des **règles Firestore** : sans être connecté au bon compte, personne ne peut lire ni écrire tes données.
- **Verrouiller les inscriptions** (recommandé, app personnelle) : une fois ton compte créé, Firebase → Authentication → **Settings → User actions** → décoche **Enable create (sign-up)**. Plus personne ne peut créer de compte.
- Optionnel : dans Google Cloud Console → **APIs & Services → Credentials**, restreins la clé d'API aux « HTTP referrers » `https://<ton-nom>.github.io/*` et `http://localhost:5173/*`.
- Utilise un mot de passe unique et solide (ou la connexion Google).
- Se déconnecter retire les données **de cet appareil** (utile sur un ordinateur partagé) ; elles restent dans ton compte.
- Quota gratuit Firebase (plan Spark) : très largement suffisant pour un budget personnel.
- La connexion Google se fait par fenêtre contextuelle. Si ton navigateur la bloque, utilise courriel + mot de passe.

## Comment ça marche

- Les données restent d'abord **dans le navigateur** : l'app marche **hors ligne** et se resynchronise au retour du réseau (Firestore garde aussi un cache hors ligne).
- Chaque dépense est un document Firestore distinct (`users/{uid}/expenses/{id}`) ; les réglages (jour de paie, budgets, catégories) sont dans `users/{uid}/meta/settings`. Deux appareils qui ajoutent des dépenses en même temps **ne s'écrasent pas**.
- Seul ce qui a changé est envoyé. Les changements des autres appareils arrivent **en direct**.
- À la première connexion d'un appareil : fusion intelligente (ce qui est nouveau ici est envoyé, ce qui a été supprimé ailleurs n'est pas « ressuscité »).
- Le thème et les particules sont des préférences **propres à chaque appareil** (non synchronisées).

## Structure

```
src/
  App.tsx, main.tsx          application et point d'entrée
  store.ts                   état de l'app (immuable, sauvegardé dans le navigateur) + actions
  lib/                       dates, budgets/statistiques, stockage (TypeScript pur)
  sync/engine.ts             moteur de synchronisation (indépendant de React et de Firebase)
  sync/firebaseBackend.ts    pont Firebase (Auth + Firestore), chargé seulement si configuré
  particles/engine.ts        moteur de particules (canvas)
  views/ components/         écrans et composants React
firestore.rules              règles de sécurité à publier dans Firebase
.github/workflows/deploy.yml déploiement automatique sur GitHub Pages
tests/engine.test.ts         tests du moteur de synchronisation (npm run test:engine)
```

Commandes : `npm run dev` · `npm run build` (vérifie les types puis construit dans `dist/`) · `npm run preview` · `npm run typecheck` · `npm run test:engine`.
