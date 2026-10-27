# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 8b-1 : liste des achats (/stock/achats) et formulaire de nouvel achat (/stock/achats/nouveau).
Phases 0 à 8a livrées. Résultats à confirmer : 7a, 7b (intégrité), 7c (export), 8a (tests A à D).

## Prochaine phase
Phase 8b-2 : détail d'un achat (/stock/achats/:id) avec lignes, paiements, paiement du reste dû,
annulation avec motif ; dettes fournisseurs sur l'accueil ; achats dans l'export CSV.
Ensuite : phase 9 (pertes et corrections : déjà largement couvert par 7b, à réévaluer), puis bloc C (fabrication).

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
- ACHATS (SQL) : create_purchase atomique ; total = lignes - remise + frais ; coût réel de ligne =
  ligne + (frais - remise) x ligne / sous-total ; sous-total > 0 ; achats/lignes/paiements jamais supprimés
- ACHATS (écran) : l'aperçu est calculé dans le navigateur (indicatif), le serveur recalcule tout ;
  prix saisi par unité d'achat (par litre, par kg...) ; 30 lignes maximum par achat à l'écran (100 côté base)
- Modes de paiement proposés à l'écran : Espèces, Virement, Chèque, Paiement électronique, Autre
  (texte libre côté base ; pas encore relié aux comptes de trésorerie : phase 20)
- Droits : création/paiement/annulation = admin et gestionnaire ; lecture achats = admin, gestionnaire, lecteur
  (vendeur : pas d'accès aux achats)
- Écrans : /stock, /stock/matieres, /stock/fournisseurs, /stock/mouvements, /stock/mouvements/nouveau,
  /stock/achats, /stock/achats/nouveau, /plus, /plus/sauvegarde, /equipe
- Migrations exécutées à la main dans Supabase > SQL Editor, en parties courtes

## Migrations appliquées (projet actuel)
- 20261020000100_phase2_base.sql
- 20261020000200_phase3_rls.sql
- 20261020000300_phase5a_team.sql
- 20261020000400_phase6_stock.sql (3 parties)
- 20261020000500_phase8a_purchases.sql (3 parties ; tests A à D à confirmer)
Aucune nouvelle migration en 8b-1.

## Règle de travail
Après chaque migration SQL : test de comptage avant de continuer.
Comptage attendu : 12 tables, 20 fonctions, 18 politiques.
Après chaque saisie de stock : somme des mouvements = quantité en stock.
Après chaque achat : total = sous-total - remise + frais.
Export hebdomadaire des fichiers, copiés hors de l'application.

## Incidents résolus
- "Invalid API key" : build/cache ; navigation privée après nouveau build
- Entreprise invisible : SQL de la phase 3 non exécuté
- Script coupé au collage : découper en parties courtes
- Compte Supabase fermé : nouveau projet, migrations rejouées, secrets GitHub remplacés
- E-mail de confirmation vers localhost : Site URL à corriger dans Supabase

## Points en attente
- Annulation d'achat : le coût moyen ne revient pas à sa valeur d'avant (limite connue)
- Pas d'avoir fournisseur ni de correction de paiement ; retour fournisseur manuel = stock seulement
- Les liens de la liste des achats vers le détail arrivent en 8b-2
- Les exports CSV ne contiennent pas encore les achats ni les paiements
- Les coûts sont lisibles par tous les membres autorisés ; vendeur masqué seulement à l'affichage (phase 25)
- Login.tsx : message d'erreur technique à simplifier (optionnel)
- Confirm email Supabase : noter l'état
