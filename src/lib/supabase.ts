import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Client null si les variables sont absentes (l'application s'affiche quand même).
export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
