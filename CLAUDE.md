# CLAUDE.md

Guidance pour Claude Code (claude.ai/code) sur ce dépôt.

## Ce que c'est

Comparatom est une PWA francophone perso (un foyer : Thomas + sa conjointe) pour relever
les prix des produits (aliments surtout) magasin par magasin et savoir tout de suite si un
produit est cher ou non. Single-page app, aucun build, itérée par commits directs sur
`index.html`. Inspirée de Paletom (même auteur, même stack).

## Lancer / tester

Pas de build, pas de gestionnaire de paquets, pas de tests.

Serveur statique local :
```bash
python3 -m http.server 8788
```
Puis `http://localhost:8788/index.html`.

Firebase est un backend partagé live : tester en local écrit dans le **même** projet
Firestore que la prod, sauf si on remplace la config.

Déploiement : GitHub Pages sert directement `main` (repo `applicatom/Comparatom`, publié sur
`applicatom.github.io/Comparatom`). Pousser sur `main` = déployer. Pas de CI, pas de staging.

## Configuration Firebase (à faire une fois)

Bloc `// === CONFIG FIREBASE ===` en haut du `<script type="module">` dans `index.html`.
Tant que les 6 valeurs contiennent `REMPLACE_MOI`, l'app n'affiche que l'écran de config.

1. Projet sur console.firebase.google.com
2. Firestore Database en mode production, région `eur3`
3. App Web → copier l'objet config → coller les 6 clés
4. Règles Firestore : ouvertes au départ (app perso, pas d'auth), à resserrer plus tard :
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents { match /{document=**} { allow read, write: if true; } }
   }
   ```

## Architecture

Tout dans `index.html` : CSS dans un `<style>`, markup, puis deux scripts en fin de body :
- `<script type="module">` : init Firebase (import ESM depuis jsDelivr `firebase@10.12.0`),
  expose `window.CT` (helpers Firestore + `CT.start(foyerId)` qui pose les listeners
  `onSnapshot`), écoute la collection racine `foyers` pour la résolution des codes.
- `<script>` classique (IIFE) : toute la logique DOM, pas de framework, `document.getElementById`
  + `innerHTML`, fonctions exposées sur `window` pour les `onclick`.

Le script classique (parsing) s'exécute avant le module (deferred) : il pose
`window.onCTReady = boot`, le module l'appelle quand Firestore est prêt.

**Navigation** : `showPage(id)` bascule les `<div class="page">` et met à jour la nav basse.
`rerender()` est rappelé à chaque snapshot Firestore pour re-render la page active.

## Modèle de données (Firestore)

```
foyers/{foyerId}                { nom, code, createdAt }
foyers/{foyerId}/magasins/{id}  { nom, enseigne?, ville?, createdAt }
foyers/{foyerId}/produits/{id}  { nom, nomLower, categorie, unite: 'kg'|'piece'|'L', createdAt }
foyers/{foyerId}/releves/{id}   { produitId, magasinId, prix (€/unité), date 'YYYY-MM-DD',
                                  promo (bool), auteur?, createdAt }
foyers/{foyerId}/liste/{id}     { produitId, qte, coche (bool), addedAt }
```

`window._magasins / _produits / _releves / _liste` : synchronisés en temps réel.
`localStorage` : `comparatom_foyer_id`, `comparatom_foyer_nom`, `comparatom_mes_foyers`,
`comparatom_last_magasin`, `comparatom_user_nom`, `comparatom_theme`.

**Une seule unité par produit.** Un produit vendu au kg ET à la pièce → deux produits.

## Logique "cher ou pas cher" (`index.html`, section LOGIQUE PRIX)

- `prixActuel(pid, mid)` = relevé **non-promo** le plus récent du couple.
  `stale` si > `STALE_DAYS` (60 j), `dead` si > `DEAD_DAYS` (120 j, exclu des calculs).
- `meilleurPrix(pid)` = min des `prixActuel` non-`dead`, tous magasins.
- `ecartPct(prix, best)` en % ; `classeEcart` : ≤ +1 % vert · +1→+8 % ambre · > +8 % rouge.
- `statsMagasin(mid)` : écart moyen sur les produits où ce magasin ET un autre ont un prix
  actuel non-périmé, + nb de fois le moins cher, + nb relevés + dernier passage.
- Les relevés `promo:true` ne comptent jamais : affichés à part sur la fiche produit.

Si tu touches ces fonctions, garde ces règles : pas de comparaison à une promo ni à un
relevé périmé.

## Écrans

Saisie (accueil) · Produits (rayons + recherche) · Fiche produit (comparatif magasins) ·
Stats (mes magasins) · Liste de courses (partagée, estimation panier) · Réglages.

## Versioning / PWA

`APP_VERSION` (constante) affichée dans Réglages. `verifierMAJ()` compare le `Last-Modified`
du `index.html` en ligne et propose de recharger (purge SW + caches).
`sw.js` : cache `comparatom-v1` — **bump `-vN`** quand on change les assets cachés ;
il laisse toujours passer les requêtes Firestore/Google en réseau.
`manifest.json` : `scope`/`start_url` = `/Comparatom/` (chemin GitHub Pages).

## Idées non faites (v1)

Scan code-barres, photo d'étiquette, alerte inflation par produit, budget mensuel,
règles Firestore avec auth, fusion de magasins.
