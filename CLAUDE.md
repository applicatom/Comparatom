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
  `onSnapshot`), écoute la collection racine `foyers` (liste de tous les foyers).
- `<script>` classique (IIFE) : toute la logique DOM, pas de framework, `document.getElementById`
  + `innerHTML`, fonctions exposées sur `window` pour les `onclick`.

Le script classique (parsing) s'exécute avant le module (deferred) : il pose
`window.onCTReady = boot`, le module l'appelle quand Firestore est prêt.

**Navigation** : `showPage(id)` bascule les `<div class="page">` et met à jour la nav basse.
`rerender()` est rappelé à chaque snapshot Firestore pour re-render la page active.

## Modèle de données (Firestore)

```
foyers/{foyerId}                { nom, createdAt }
foyers/{foyerId}/categories/{id} { nom, nomEs?, emoji, ordre, createdAt }   (id = slug pour les 15 défauts)
foyers/{foyerId}/magasins/{id}  { nom, enseigne?, ville?, createdAt }
foyers/{foyerId}/produits/{id}  { nom, nomLower, categorie (=id catégorie), unite: 'kg'|'piece'|'L',
                                  thumb? (dataURL ~150px), codeBarres?, createdAt }
foyers/{foyerId}/photos/{produitId} { data: dataURL jpeg ~1000px }   (lazy: getDoc, PAS de listener)
foyers/{foyerId}/releves/{id}   { produitId, magasinId, prix (€/unité), date 'YYYY-MM-DD',
                                  promo (bool), marque?, origine?, note?, auteur?, createdAt }
foyers/{foyerId}/liste/{id}     { produitId, qte, coche (bool), addedAt }
                               OU { libre: "texte", qte, coche, addedAt }  (article libre :
                               ne crée NI produit NI relevé ; pas de prix, pas d'emoji)
```

`window._magasins / _produits / _releves / _liste / _categories` : synchronisés en temps réel.
`window._photoCache` : cache mémoire des grandes photos (getDoc à la demande).
`localStorage` : `comparatom_foyer_id`, `comparatom_foyer_nom`,
`comparatom_last_magasin`, `comparatom_user_nom`, `comparatom_theme`, `comparatom_lang`.

**Une seule unité par produit.** Un produit vendu au kg ET à la pièce → deux produits.

**Catégories = données.** `CATS_DEFAUT` (15) seedées via `seedCategoriesIfEmpty()` au 1er
passage sur un foyer, doc id = le slug (`viande`…) pour compat. CRUD complet dans Réglages
(nom, emoji via `openEmojiPicker`, ordre, suppression → produits réaffectés à `autre`).
`catOf(id)` lit `_categories` (fallback `CAT_FALLBACK`). `catLabel(c)` = FR ou ES.

**i18n** : `I18N = { fr, es }` (~130 clés), `t(k, vars)`, `LANG` en localStorage.
Chaînes statiques du HTML : attributs `data-i18n` / `data-i18n-html` / `data-i18n-ph` +
`applyStaticI18n()`. Bascule FR/Español dans Réglages (`setLang`). ES = espagnol Mexique
(séparateur décimal `.`, unité pièce = `pza`).

## Logique "cher ou pas cher" (`index.html`, section LOGIQUE PRIX)

- **Marque au niveau du relevé** (`releve.marque`, optionnel). `marquesDe(pid)` = marques
  distinctes vues (`''` = sans marque, en dernier).
- `statCouple(pid, mid, marque)` = { actuelPrix, moy, min, max, n, dead… } d'un couple
  (produit, magasin, marque). `relevesCouple` filtre non-promo.
- `bestStatStore(pid, mid)` = la stat la moins chère parmi les marques du magasin.
- `prixActuel(pid, mid)` = `bestStatStore` réduit ({prix, dead, marque}).
  `stale` > `STALE_DAYS` (60 j), `dead` > `DEAD_DAYS` (120 j, exclu des calculs).
- `meilleurPrix(pid)` = min des `prixActuel` non-`dead`, tous magasins (garde `marque`).
- Fiche produit : si ≥ 2 marques → un bloc par marque ; sinon tableau plat. Chaque ligne
  magasin montre prix actuel, écart coloré, moyenne, nb relevés, + sparkline si n ≥ 3.
  Section "Historique complet" = tous les relevés (promo inclus) chronologiques.
- `statsMagasin(mid)` : inchangé (raisonne au prix le plus bas du magasin, marque confondue).
- `ecartPct` / `classeEcart` : ≤ +1 % vert · +1→+8 % ambre · > +8 % rouge.
- Les relevés `promo:true` ne comptent jamais dans meilleurPrix ni les stats.

Si tu touches ces fonctions, garde ces règles : pas de comparaison à une promo ni à un
relevé périmé.

## Photos

`compressImage(file, maxPx, quality)` (canvas → dataURL jpeg). `setPhotoProduit` génère un
`thumb` ~150px (dans le doc produit, sert les vignettes de listes via `vignette(p)`) + une
photo pleine ~1000px dans `photos/{produitId}` (chargée à l'ouverture de la fiche par
`loadPhoto`). Bouton 📷 = `<input type=file accept=image/*>` caché (`pickPhoto` /
`onPhotoPicked`) → appareil ou bibliothèque au choix de l'OS. Firestore doc < 1 Mo : la
compression descend la qualité si le dataURL dépasse ~350 000 caractères.

## Écrans

Onboarding (choisir un foyer dans la liste, ou en créer un — **pas de code d'accès**,
tous les foyers sont visibles ; au 1er lancement on entre direct si un seul foyer existe ;
bascule de langue) · Saisie (accueil ; produit, magasin, prix, marque/origine/note
optionnels, photo à la création) · Produits (rayons dynamiques + recherche, vignettes photo) ·
Fiche produit (comparatif par marque × magasin, moyennes, historique, photo) ·
Stats (mes magasins) · Liste de courses (partagée ; articles réels OU libres ; carte
« Où acheter » = `optiPanier` : meilleur magasin unique par couverture, ou panier réparti
par article le moins cher) · Réglages
(prénom, gestion des foyers/magasins/produits, thème, export).

## Versioning / PWA

`APP_VERSION` (constante) affichée dans Réglages. `verifierMAJ()` compare le `Last-Modified`
du `index.html` en ligne et propose de recharger (purge SW + caches).
Palette : **zinc + teal** (accent `#0d9488`), clair + sombre + `data-theme`. Boutons avec
relief (`box-shadow` + effet pressé au clic). Chaque catégorie a une couleur dédiée parmi
8 teintes froides (`--cat0-bg/fg` … `--cat7-bg/fg`, cyclique par index d'ordre, `catClass(c)`
dans `index.html`) appliquée aux vignettes produit, tuiles de rayon, chips et fiche produit —
« Autre » reste neutre (gris). Sélecteurs composés (ex. `.lead.catcol-0`) pour l'emporter sur
les fonds par défaut de `.lead`/`.chip`/`.cat-tile .em`/`.fiche-vign`.
`sw.js` : **network-first** pour le shell (index.html/navigation/sw.js), cache-first pour le
reste ; cache `comparatom-v8` — **bump `-vN`** à chaque changement (force l'éviction) ;
il laisse toujours passer les requêtes Firestore/Google en réseau.
`manifest.json` : `scope`/`start_url` = `/Comparatom/` (chemin GitHub Pages).

## Idées non faites (v1)

Scan code-barres, photo d'étiquette, alerte inflation par produit, budget mensuel,
règles Firestore avec auth, fusion de magasins.
