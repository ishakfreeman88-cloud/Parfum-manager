# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 2 : tables profiles, companies, company_members, fonction create_company, RLS activé.

## Prochaine phase
Phase 3 : politiques RLS (isolation entre entreprises, permissions par rôle).

## Stack
React 18 + TypeScript + Vite 5, react-router-dom 6 (HashRouter), supabase-js 2.
Supabase gratuit, dépôt GitHub public (Pages impossible en privé gratuit), GitHub Pages via Actions.
Site : https://ishakfreeman88-cloud.github.io/Parfum-manager/

## Décisions
- base Vite = "/Parfum-manager/" (P majuscule, nom exact du dépôt)
- Aucune suppression d'historique : membres révoqués (status), pas supprimés
- create_company : fonction security definer, entreprise + admin créés en une transaction
- RLS activé sur toutes les tables dès leur création (refus par défaut)
- Migrations SQL exécutées à la main dans Supabase > SQL Editor, fichiers conservés dans supabase/migrations/

## Migrations appliquées
- 20261020000100_phase2_base.sql

## Points en attente
- Vérifier l'affichage du site (base "/Parfum-manager/")
- Inscription / confirmation e-mail : phase 4
