# 🥔 La Bataille des Chips

Petit site pour noter des paquets de chips entre potes (note sur 10).

- Chacun entre **son prénom**, ajoute **les paquets qu'il a ramenés**, et **note ceux des autres**.
- La **moyenne** de chaque paquet est visible par tout le monde en direct.
- Les **notes individuelles** sont **cachées** jusqu'à ce que l'organisateur clique sur **« Révéler »** (à la fin).
- Personne ne peut noter ses propres chips.

Stack : un petit serveur **Deno** + **Deno KV** (stockage partagé). Aucun compte de base de données à créer.

---

## ▶️ Lancer en local (pour tester)

```bash
# depuis ce dossier
deno task dev      # rechargement auto pendant le dev
# ou
deno task start
```

Puis ouvre **http://localhost:8000**.
(Si `deno` n'est pas trouvé : `export PATH="$HOME/.deno/bin:$PATH"`)

---

## 🚀 Déployer sur Deno Deploy (gratuit, pour la soirée)

1. Crée un compte gratuit sur **https://dash.deno.com** (connexion Google/GitHub).
2. Crée un **token d'accès** : https://dash.deno.com/account#access-tokens → « New Access Token » → copie-le.
3. Déploie depuis ce dossier :

```bash
export DENO_DEPLOY_TOKEN=ton_token_ici
deployctl deploy --project=chips-battle --entrypoint=main.ts
```

La 1re fois, le projet `chips-battle` est créé automatiquement et mis **en production**.
deployctl te donne l'**URL publique** (genre `https://chips-battle.deno.dev`) — c'est le lien à partager à tout le monde. ✅

Pour redéployer après une modif :
```bash
deployctl deploy --project=chips-battle --entrypoint=main.ts --prod
```

---

## 🔑 Code organisateur

Le bouton **« Révéler les notes »** et **« Tout réinitialiser »** demandent un code.

- Code par défaut : **`patate`**
- Pour le changer, mets une variable d'env `ORGANIZER_CODE` :
  - En local : `ORGANIZER_CODE=monsecret deno task start`
  - Sur Deno Deploy : `deployctl deploy ... --env ORGANIZER_CODE=monsecret`
    (ou dans le dashboard du projet → Settings → Environment Variables)

⚠️ Avant la vraie soirée, clique sur **♻️ Tout réinitialiser** (onglet Classement) pour repartir d'une base vide.

---

## 🗂️ Structure

```
main.ts            # serveur + API + accès Deno KV
deno.json          # tâches (dev / start)
static/index.html  # la page
static/styles.css  # le style
static/app.js      # la logique côté navigateur
```

## API (pour info)

| Méthode | Route                | Rôle                                   |
|---------|----------------------|----------------------------------------|
| GET     | `/api/state?name=X`  | état (chips, moyennes, ta note)        |
| POST    | `/api/chips`         | ajouter un paquet                      |
| POST    | `/api/chips/delete`  | supprimer son paquet                   |
| POST    | `/api/rate`          | noter un paquet (0–10, pas de soi)     |
| POST    | `/api/reveal`        | révéler / re-cacher (code requis)      |
| POST    | `/api/reset`         | tout effacer (code requis)             |
