# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 7b : mouvements de stock (ouverture, correction, perte, retour fournisseur), historique,
alertes de stock faible et valeur du stock sur l'accueil.
Phases 0 à 7a validées (à confirmer pour 7a et le test du stock).

## Prochaine phase
Phase 7c (courte, recommandée) : sauvegarde, export CSV des matières, fournisseurs et mouvements.
Puis phase 8 : achats (SQL puis écrans), stock augmenté une seule fois, remises, frais, reste dû.

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
- quantity_on_hand / avg_cost / unit non modifiables directement (droits par colonne)
- stock_movements sans modification ni suppression ; correction = nouveau mouvement
- Anti-doublon : idempotency_key (générée à l'ouverture du formulaire, renouvelée après succès) + verrou de ligne
- Mouvements manuels (record_stock_movement) : admin et gestionnaire ; lecture historique : admin, gestionnaire, lecteur
- Sorties valorisées au coût moyen courant ; entrées recalculent le coût moyen
- Une correction négative ou une perte ne modifie pas le coût moyen
- Écrans : /stock, /stock/matieres, /stock/fournisseurs, /stock/mouvements, /stock/mouvements/nouveau
- Accueil : valeur du stock = somme(quantité x coût moyen), calculée à l'affichage (indicateur provisoire) ;
  masquée aux vendeurs ; les vrais rapports seront calculés côté serveur (phases 22-23)
- Historique paginé par 30 ; matières et fournisseurs non paginés
- Migrations exécutées à la main dans Supabase > SQL Editor, en blocs courts (< 150 lignes)

## Migrations appliquées (projet actuel)
- 20261020000100_phase2_base.sql
- 20261020000200_phase3_rls.sql
- 20261020000300_phase5a_team.sql
- 20261020000400_phase6_stock.sql (exécutée en 3 parties)
Aucune nouvelle migration en 7a et 7b.

## Règle de travail
Après chaque migration SQL : test de comptage avant de continuer.
Comptage actuel attendu : 9 tables, 16 fonctions, 15 politiques.
Après chaque phase de saisie de stock : requête d'intégrité (somme des mouvements = quantité en stock).

## Incidents résolus
- "Invalid API key" : build/cache ; résolu en navigation privée après nouveau build
- Entreprise invisible : SQL de la phase 3 non exécuté
- Script coupé au collage : découper en parties courtes
- Compte Supabase fermé : nouveau projet, migrations rejouées, secrets GitHub remplacés
- E-mail de confirmation vers localhost : Site URL à corriger dans Supabase

## Points en attente
- SAUVEGARDE : export CSV/SQL régulier AVANT la saisie de vraies données (prioritaire, phase 7c)
- Les coûts (avg_cost) et les mouvements sont lisibles par tous les membres autorisés ; masquage pour
  les vendeurs seulement à l'affichage pour avg_cost : à restreindre côté base en phase 25
- Aucune annulation d'un mouvement : à corriger par un mouvement inverse (voulu)
- Login.tsx : message d'erreur technique à simplifier (optionnel)
- Noter l'état de "Confirm email" dans Supabase
- Pas d'unités personnalisées ; pas d'audit des modifications de fiches
