# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 13b : détail d'un lot (/fabrication/lots/:id), export CSV des lots et de leurs consommations.
Le bloc C (fabrication) est terminé côté écrans. Phases 0 à 13 livrées.
Résultats à confirmer : 7a, 7b (intégrité), 7c (export), 8b (build vert), 10a (tests B et C),
11b (build vert), 12a (comptage 19/22/30 annoncé réussi ; tests B et C à confirmer), 13a, 13b.

## Prochaine phase
Phase 14a : SQL du conditionnement. Tables product_variants (parfum + format + flacon + bouchon +
étiquette + emballage), packaging_runs (conditionnement d'un lot en flacons), packaging_consumptions,
finished_stock et finished_movements ; fonction transactionnelle create_packaging_run : retire des ml du
vrac du lot, consomme flacons, bouchons, étiquettes et boîtes, calcule le coût unitaire d'un flacon
(coût du vrac utilisé + composants), augmente le stock de produits finis. 14b : écrans.

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
- Prix d'un achat saisi PAR UNITÉ D'ACHAT (par ml, par litre), pas par bouteille. Champ "montant total
  de la ligne" : en attente de décision
- Paiement fournisseur : plafonné au reste dû ; pas relié aux comptes de trésorerie (phase 20)
- RECETTES : recette -> VERSIONS immuables ; flacons, bouchons, étiquettes, boîtes refusés dans une recette ;
  recettes lisibles par admin et gestionnaire uniquement
- FORMATS : volume TOUJOURS en ml, non modifiable ; PARFUMS : nom et référence uniques
- FABRICATION : un lot = une version de recette + volume à fabriquer + volume obtenu ; quantités prévues
  proportionnelles ; quantités réelles modifiables ; consommation au coût moyen courant ; coût du lot =
  somme des quantités réelles x coût moyen ; coût par ml = coût du lot / volume OBTENU (pertes comprises) ;
  écart de volume = obtenu - théorique ; lot atomique ; pas d'annulation ; version COURANTE utilisée à l'écran ;
  confirmation renforcée si écart de volume > 10 % ou coût moyen nul ; volume restant en vrac
  (bulk_remaining_ml) jusqu'au conditionnement ; flacons, étiquettes, emballages hors coût du lot
- Détail d'un lot : somme des lignes comparée au coût enregistré (alerte si écart) ; différence entre
  quantité utilisée et prévue affichée par matière
- Lots et consommations lisibles par admin et gestionnaire uniquement ; consommations immuables
- Exports CSV (admin et gestionnaire) : matières, fournisseurs, mouvements, achats, lignes d'achat, paiements
  fournisseurs, lots, consommations des lots
- Écrans existants : /stock, /stock/matieres, /stock/fournisseurs, /stock/mouvements,
  /stock/mouvements/nouveau, /stock/achats, /stock/achats/nouveau, /stock/achats/:id,
  /fabrication, /fabrication/parfums, /fabrication/formats, /fabrication/recettes,
  /fabrication/recettes/nouveau, /fabrication/recettes/:id, /fabrication/recettes/:id/version,
  /fabrication/lots, /fabrication/lots/nouveau, /fabrication/lots/:id, /plus, /plus/sauvegarde, /equipe
- Migrations exécutées à la main dans Supabase > SQL Editor, en parties courtes (< 150 lignes)

## Migrations appliquées (projet actuel)
- 20261020000100_phase2_base.sql
- 20261020000200_phase3_rls.sql
- 20261020000300_phase5a_team.sql
- 20261020000400_phase6_stock.sql (3 parties)
- 20261020000500_phase8a_purchases.sql (3 parties ; comptage 12/20/18 constaté)
- 20261020000600_phase10a_recipes.sql (3 parties ; exécutée, comptage 17/21/28 attendu)
- 20261020000700_phase12a_production.sql (2 parties ; exécutée, comptage 19/22/30 attendu)
Aucune nouvelle migration en 13a et 13b.

## Règle de travail
Après chaque migration SQL : test de comptage avant de continuer.
Comptage attendu : 19 tables, 22 fonctions, 30 politiques.
Après chaque saisie de stock : somme des mouvements = quantité en stock.
Après chaque achat : total = sous-total - remise + frais ; amount_paid = somme des paiements.
Après chaque lot : somme des line_cost = total_cost ; cost_per_ml = total_cost / actual_volume_ml.
Export hebdomadaire des fichiers, copiés hors de l'application.
Fichiers longs : si le build échoue avec "has no corresponding closing tag" ou "'}' expected", le fichier a
été tronqué au collage : comparer sa dernière ligne avec la fin du code fourni, utiliser le bouton Copier.
Une migration créée dans GitHub n'est PAS appliquée à Supabase : il faut la coller dans le SQL Editor.

## Incidents résolus
- "Invalid API key" : build/cache ; navigation privée après nouveau build
- Entreprise invisible : SQL de la phase 3 non exécuté
- Script coupé au collage : découper en parties courtes
- Compte Supabase fermé : nouveau projet, migrations rejouées, secrets GitHub remplacés
- E-mail de confirmation vers localhost : Site URL à corriger dans Supabase
- Builds rouges en 8b (PurchaseDetail.tsx) et 11b (RecipeDetail.tsx) : fichiers tronqués au collage
- Table production_batches absente : migration 12a non exécutée, puis exécutée

## Points en attente
- Un lot ne peut pas être annulé : une erreur se corrige par des mouvements de stock
- Le stock peut changer entre l'aperçu et l'enregistrement : la base refuse alors le lot avec un message
- Le coût du lot n'inclut pas flacons, étiquettes, emballages (phase 14)
- Les exports ne contiennent pas encore : membres, invitations, journal d'audit, parfums, formats, recettes
- Annulation d'achat : le coût moyen ne revient pas à sa valeur d'avant (limite connue)
- Pas d'avoir fournisseur ni de correction de paiement ; retour fournisseur manuel = stock seulement
- Les coûts sont lisibles par tous les membres autorisés ; vendeur masqué seulement à l'affichage (phase 25)
- Login.tsx : message d'erreur technique à simplifier (optionnel)
- Confirm email Supabase : noter l'état ; vérifier Database > Backups du plan gratuit
- Décider du champ "montant total de la ligne" pour les achats
