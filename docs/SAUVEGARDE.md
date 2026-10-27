# Sauvegarde et restauration

## Où se trouve quoi
- Code et migrations SQL : GitHub (dépôt Parfum-manager). Ne jamais y mettre de clés secrètes ni de données réelles.
- Données de l'entreprise : Supabase uniquement. Seule copie réelle, sauf exports.

## Routine hebdomadaire (5 minutes)
1. Application > Plus > Sauvegarde et export.
2. Télécharger les 3 fichiers (matières, fournisseurs, mouvements).
3. Les copier hors de l'application (ordinateur + Drive ou clé USB).
4. Ouvrir l'application au moins une fois par semaine : un projet Supabase gratuit inactif
   7 jours est mis en pause.

## Ce que contiennent les exports
Toutes les lignes (archivées incluses), avec accents (UTF-8), séparateur ";" et virgule décimale.
Ils contiennent des coûts : ne pas les partager.

## Limites actuelles
- Il n'existe pas d'import CSV : un export est un registre lisible, pas une restauration automatique.
- Les exports ne contiennent pas encore : membres, invitations, journal d'audit (à ajouter plus tard).
- Je n'ai pas vérifié les sauvegardes automatiques du plan gratuit Supabase : contrôler
  Supabase > Database > Backups et ne pas compter dessus.

## Restauration après une perte du projet Supabase
1. Créer un nouveau projet Supabase.
2. Rejouer les migrations dans l'ordre (dossier supabase/migrations), une partie à la fois, puis
   le test de comptage (voir ETAT.md).
3. Remplacer les deux secrets GitHub (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY),
   relancer le workflow (Actions > Run workflow).
4. Corriger Authentication > URL Configuration (Site URL et Redirect URL).
5. Recréer le compte, l'entreprise, les fournisseurs et les matières.
6. Stock : saisir pour chaque matière un mouvement "Stock d'ouverture" avec la quantité et le coût
   moyen du dernier export (colonnes "Quantité en stock" et "Coût moyen").
   L'historique détaillé est perdu mais reste consultable dans l'ancien fichier de mouvements.
