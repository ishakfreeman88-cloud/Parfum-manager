# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 5b : écran Équipe (inviter par code, rôles, retrait), rejoindre une entreprise par code.
Bloc A (fondations, comptes, sécurité, équipe) terminé, sous réserve des tests ci-dessous.

## Prochaine phase
Phase 6 : SQL du stock : fournisseurs, matières premières, unités et conversions, mouvements de stock.

## Stack
React 18 + TypeScript + Vite 5, react-router-dom 6 (HashRouter), supabase-js 2 (flowType pkce).
Supabase gratuit, dépôt GitHub public, GitHub Pages via Actions.
Site : https://ishakfreeman88-cloud.github.io/Parfum-manager/
Entreprise de test : RoyalStoreDz (id 039cbb14-6512-4cf2-9c53-19acca7fc6a9)

## Décisions
- base Vite = "/Parfum-manager/"
- Invitation par CODE à usage unique (16 caractères, 7 jours), transmis hors application
- Un utilisateur = une entreprise active
- Écritures sur company_members, invitations, audit_logs uniquement par fonctions security definer
- Dernier administrateur protégé ; membres révoqués conservés (status revoked)
- Messages SQL en français (code P0001) affichés tels quels ; autres erreurs : message générique
- Un admin ne peut pas modifier ni retirer sa propre ligne depuis l'écran (protection)
- Migrations exécutées à la main dans Supabase > SQL Editor
- Fichiers de l'application : src/{auth,company,components,lib,pages,styles}

## Migrations appliquées
- 20261020000100_phase2_base.sql
- 20261020000200_phase3_rls.sql
- 20261020000300_phase5a_team.sql (tests C et D validés)

## Incidents résolus
- "Invalid API key" : build/cache, résolu en navigation privée après nouveau build
- Entreprise invisible : le SQL de la phase 3 n'avait pas été exécuté
- Phase 5a non appliquée au premier essai : vérifier le test A (6 fonctions, 7 politiques) après chaque migration
- Lignes grises "!" dans Actions = builds annulés par un commit plus récent (normal)

## Règle de travail
Après chaque migration SQL : lancer le test de comptage (fonctions/politiques) avant de continuer.

## Points en attente
- Supprimer l'entreprise doublon 88352a79-e41b-4e93-a8c5-8653513e6ad2 (sans membre)
- Tests de la phase 5b à cocher (invitation, rôle, retrait, audit, isolation)
- Login.tsx : message d'erreur technique à simplifier (optionnel indiqué en 5b)
- Noter l'état de "Confirm email" dans Supabase
