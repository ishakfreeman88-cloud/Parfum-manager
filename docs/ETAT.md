# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 11a : menu Fabrication, écrans Parfums et Formats.
Phases 0 à 10a livrées. Résultats à confirmer : 7a, 7b (intégrité), 7c (export), 8b (build vert),
10a (comptage 17/21/28, tests B et C), 11a.

## Prochaine phase
Phase 11b : écrans des recettes (liste par parfum, création d'une recette, nouvelle version, consultation
des versions précédentes, calcul des quantités pour un volume donné, aucun accès pour vendeur et lecteur).
Puis 12 : fonction SQL transactionnelle de fabrication (vérification du stock, consommation, lot).

## Stack
React 18 + TypeScript + Vite 5, react-router-dom 6 (HashRouter), supabase-js 2 (flowType pkce).
Supabase gratuit (NOUVEAU projet), dépôt GitHub public, GitHub Pages via Actions.
Site : https://ishakfreeman88-cloud.github.io/Parfum-manager/
Secrets GitHub : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (valeurs du projet Supabase actuel)
Supabase > Authentication > URL Configuration : Site URL et Redirect URL = adresse du site (P majuscule)

## Décisions
- base Vite = "/Parfum-manager/"
- Invitation par CODE à usage unique ; un utilisateur = une entreprise active
- Écritures sensibles uniquement par fonctions security definer
- STOCK : quantité et coût moyen pondéré en unité de BASE (ml, g, unit) ; cl exclu ; volume<->masse refusé
- stock_movements sans modification ni suppression ; correction = nouveau mouvement
- Anti-doublon : idempotency_key (générée à l'ouverture du formulaire, renouvelée après succès,
  conservée après une erreur) + verrou de ligne
- ACHATS : create_purchase atomique ; total = lignes - remise + frais ; coût réel de ligne =
  ligne + (frais - remise) x ligne / sous-total ; achats, lignes, paiements jamais supprimés
- Prix d'un achat saisi PAR UNITÉ D'ACHAT (par ml, par litre), pas par bouteille : 100 ml à 1650 DA =
  quantité 100 ml, prix 16,5 DA/ml. Champ "montant total de la ligne" : en attente de décision
- Paiement fournisseur : plafonné au reste dû ; pas relié aux comptes de trésorerie (phase 20)
- RECETTES : recette (nom, parfum) -> VERSIONS immuables ; modifier = nouvelle version ; version courante =
  numéro le plus élevé ; une version = volume cible, rendement théorique, instructions, notes, date d'entrée
  en vigueur, ingrédients (quantité dans l'unité de BASE, pour le volume cible)
- Recette : flacons, bouchons, étiquettes, boîtes REFUSÉS (conditionnement, phase 14) ; une matière une seule
  fois par version ; 1 à 50 ingrédients ; aucune conversion volume<->masse
- Recettes lisibles et créables par admin et gestionnaire uniquement ; parfums et formats lisibles par tous
  les membres, modifiables par admin et gestionnaire
- FORMATS : volume TOUJOURS en ml (volume_ml), non modifiable après création, un seul format par volume ;
  nom par défaut "<volume> ml"
- PARFUMS : nom unique (insensible à la casse) et référence unique par entreprise ; archivage, jamais de suppression
- Écrans existants : /stock, /stock/matieres, /stock/fournisseurs, /stock/mouvements,
  /stock/mouvements/nouveau, /stock/achats, /stock/achats/nouveau, /stock/achats/:id,
  /fabrication, /fabrication/parfums, /fabrication/formats, /plus, /plus/sauvegarde, /equipe
- Migrations exécutées à la main dans Supabase > SQL Editor, en parties courtes (< 150 lignes)

## Migrations appliquées (projet actuel)
- 20261020000100_phase2_base.sql
- 20261020000200_phase3_rls.sql
- 20261020000300_phase5a_team.sql
- 20261020000400_phase6_stock.sql (3 parties)
- 20261020000500_phase8a_purchases.sql (3 parties ; comptage 12/20/18 constaté)
- 20261020000600_phase10a_recipes.sql (3 parties ; à exécuter ou à confirmer : 17/21/28)
Aucune nouvelle migration en 11a.

## Règle de travail
Après chaque migration SQL : test de comptage avant de continuer.
Comptage attendu : 17 tables, 21 fonctions, 28 politiques.
Après chaque saisie de stock : somme des mouvements = quantité en stock.
Après chaque achat : total = sous-total - remise + frais ; amount_paid = somme des paiements.
Export hebdomadaire des fichiers, copiés hors de l'application.
Fichiers longs : si le build échoue avec "has no corresponding closing tag", le fichier a été tronqué au
collage : comparer sa dernière ligne avec la fin du code fourni, utiliser le bouton Copier du bloc.

## Incidents résolus
- "Invalid API key" : build/cache ; navigation privée après nouveau build
- Entreprise invisible : SQL de la phase 3 non exécuté
- Script coupé au collage : découper en parties courtes
- Compte Supabase fermé : nouveau projet, migrations rejouées, secrets GitHub remplacés
- E-mail de confirmation vers localhost : Site URL à corriger dans Supabase
- Build rouge en 8b : PurchaseDetail.tsx tronqué au collage (fin du fichier à recoller)

## Points en attente
- Annulation d'achat : le coût moyen ne revient pas à sa valeur d'avant (limite connue)
- Pas d'avoir fournisseur ni de correction de paiement ; retour fournisseur manuel = stock seulement
- Les coûts sont lisibles par tous les membres autorisés ; vendeur masqué seulement à l'affichage (phase 25)
- Les exports ne contiennent pas encore : membres, invitations, journal d'audit, parfums, formats, recettes
- Une recette ne contrôle pas que la somme des volumes égale le volume cible (rendement saisi à la main)
- Login.tsx : message d'erreur technique à simplifier (optionnel)
- Confirm email Supabase : noter l'état ; vérifier Database > Backups du plan gratuit
- Décider du champ "montant total de la ligne" pour les achats
