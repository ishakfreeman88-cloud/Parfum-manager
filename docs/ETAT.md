# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 7a : écrans fournisseurs et matières premières (liste, ajout, modification, archivage).
Phases 0 à 6 validées.

## Prochaine phase
Phase 7b : stock d'ouverture, mouvements manuels (correction, perte, retour fournisseur),
historique des mouvements, alertes de stock faible sur l'accueil.

## Stack
React 18 + TypeScript + Vite 5, react-router-dom 6 (HashRouter), supabase-js 2 (flowType pkce).
Supabase gratuit (NOUVEAU projet depuis la fermeture de l'ancien compte), dépôt GitHub public, GitHub Pages via Actions.
Site : https://ishakfreeman88-cloud.github.io/Parfum-manager/
Secrets GitHub : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (valeurs du projet Supabase actuel)
Supabase > Authentication > URL Configuration : Site URL et Redirect URL = adresse du site (avec P majuscule)

## Décisions
- base Vite = "/Parfum-manager/"
- Invitation par CODE à usage unique ; un utilisateur = une entreprise active
- Écritures sensibles uniquement par fonctions security definer
- STOCK : quantité et coût moyen pondéré en unité de BASE (ml, g, unit) ; cl exclu ; volume<->masse refusé
- quantity_on_hand / avg_cost / unit non modifiables directement (droits par colonne)
- stock_movements sans modification ni suppression ; correction = nouveau mouvement
- Anti-doublon : idempotency_key unique par entreprise ; verrou de ligne sur la matière
- Catalogue : création/modification admin et gestionnaire ; lecture tous les membres
- Écrans : /stock, /stock/matieres, /stock/fournisseurs ; archivage au lieu de suppression
- Coût moyen masqué aux vendeurs dans l'écran (confort seulement, la base reste lisible : voir points en attente)
- Migrations exécutées à la main dans Supabase > SQL Editor, en blocs courts (< 150 lignes)

## Migrations appliquées (projet actuel)
- 20261020000100_phase2_base.sql
- 20261020000200_phase3_rls.sql
- 20261020000300_phase5a_team.sql
- 20261020000400_phase6_stock.sql (exécutée en 3 parties)

## Règle de travail
Après chaque migration SQL : test de comptage avant de continuer.
Comptage actuel attendu : 9 tables, 16 fonctions, 15 politiques.

## Incidents résolus
- "Invalid API key" : build/cache ; résolu en navigation privée après nouveau build
- Entreprise invisible : SQL de la phase 3 non exécuté
- Script coupé au collage : découper en parties courtes
- Compte Supabase fermé : nouveau projet, migrations rejouées, secrets GitHub remplacés
- E-mail de confirmation vers localhost : Site URL à corriger dans Supabase

## Points en attente
- SAUVEGARDE : prévoir un export CSV/SQL régulier AVANT la saisie de vraies données (prioritaire)
- Les coûts (avg_cost) sont lisibles par tous les membres, vendeurs compris : à restreindre en phase 25
- Login.tsx : message d'erreur technique à simplifier (optionnel)
- Noter l'état de "Confirm email" dans Supabase
- Pas d'unités personnalisées ; pas d'audit des modifications de fiches (les mouvements, eux, sont tracés)
