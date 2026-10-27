# CARNET DE BORD : Parfum Manager

## Dernière phase terminée
Phase 8a : SQL des achats (purchases, purchase_items, purchase_payments) et fonctions
create_purchase, record_purchase_payment, cancel_purchase.
Phases 0 à 7c livrées (résultats de 7b et 7c à confirmer).

## Prochaine phase
Phase 8b : écrans des achats (liste, nouvel achat avec lignes, remise, frais, paiement initial,
détail, paiement du reste dû, annulation), dettes fournisseurs sur l'accueil.
Puis phase 9 : pertes, corrections, alertes (à fusionner en partie avec 7b déjà faite : à réévaluer).

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
- Anti-doublon : idempotency_key + verrou de ligne
- ACHATS : create_purchase atomique (achat + lignes + mouvements de stock + paiement initial)
- Clé d'idempotence OBLIGATOIRE (générée par l'écran à l'ouverture du formulaire) ; mouvements dérivés : clé:ligne
- Total = lignes - remise + frais ; coût réel de ligne = ligne + (frais - remise) x ligne / sous-total ;
  coût par unité de base arrondi à 4 décimales
- Montants en DZD, numeric(14,2) ; sous-total des lignes obligatoirement > 0 (pas d'achat gratuit :
  utiliser une correction ou un stock d'ouverture)
- amount_due = total - amount_paid (colonne calculée) ; payment_status unpaid / partial / paid
- Numéro d'achat par entreprise via companies.purchase_seq (verrou de l'entreprise : achats sérialisés)
- purchase_items et purchase_payments : jamais modifiés ni supprimés (déclencheur)
- Annulation : sans paiement seulement, motif obligatoire, stock retiré au coût moyen COURANT
- Paiement fournisseur : mode libre (texte) pour l'instant ; PAS encore relié à un compte de trésorerie
  (caisse/banque) : lien prévu en phase 20
- Droits : création, paiement, annulation = admin et gestionnaire ; lecture = admin, gestionnaire, lecteur
- Migrations exécutées à la main dans Supabase > SQL Editor, en parties courtes

## Migrations appliquées (projet actuel)
- 20261020000100_phase2_base.sql
- 20261020000200_phase3_rls.sql
- 20261020000300_phase5a_team.sql
- 20261020000400_phase6_stock.sql (3 parties)
- 20261020000500_phase8a_purchases.sql (3 parties ; à cocher après tests A à D)

## Règle de travail
Après chaque migration SQL : test de comptage avant de continuer.
Comptage attendu après 8a : 12 tables, 20 fonctions (16 + 4), 18 politiques.
Après chaque saisie de stock : somme des mouvements = quantité en stock.
Export hebdomadaire des fichiers, copiés hors de l'application.

## Incidents résolus
- "Invalid API key" : build/cache ; navigation privée après nouveau build
- Entreprise invisible : SQL de la phase 3 non exécuté
- Script coupé au collage : découper en parties courtes
- Compte Supabase fermé : nouveau projet, migrations rejouées, secrets GitHub remplacés
- E-mail de confirmation vers localhost : Site URL à corriger dans Supabase

## Points en attente
- Annulation d'achat : le coût moyen ne revient pas à sa valeur d'avant (limite connue)
- Pas de retour partiel fournisseur ni d'avoir : le retour fournisseur manuel (phase 7b) réduit le stock
  mais ne réduit pas la dette
- Pas de correction ni d'annulation d'un paiement fournisseur
- Paiements non reliés à la trésorerie (phase 20)
- Les exports CSV ne contiennent pas encore les achats ni les paiements (à ajouter)
- Les coûts sont lisibles par tous les membres autorisés ; vendeur masqué seulement à l'affichage (phase 25)
- Login.tsx : message d'erreur technique à simplifier (optionnel)
- Confirm email Supabase : noter l'état
- Confirmer les tests 7a, 7b (intégrité) et 7c (export)
