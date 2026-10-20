import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Adresse de l'application (utilisée dans les e-mails de confirmation et de réinitialisation).
export const appUrl = window.location.origin + import.meta.env.BASE_URL;

// PKCE : les liens d'e-mail arrivent avec ?code=..., compatible avec le routage par #.
export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { flowType: "pkce" },
    })
  : null;
