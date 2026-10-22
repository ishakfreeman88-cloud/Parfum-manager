import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase, appUrl } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "signup" | "forgot";

function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Adresse e-mail non confirmée. Vérifiez votre boîte mail.";
  if (m.includes("already registered")) return "Cette adresse e-mail est déjà utilisée.";
  if (m.includes("rate limit")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("password")) return "Mot de passe refusé : utilisez au moins 8 caractères.";
    return "Une erreur est survenue. Réessayez.";
}

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  if (!loading && session) return <Navigate to="/" replace />;

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !supabase) return; // protection contre le double clic
    setError("");
    setInfo("");

    if (mode !== "login" && mode !== "forgot" && password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) setError(translateError(err.message));
        else navigate("/", { replace: true });
      } else if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: appUrl,
          },
        });
        if (err) setError(translateError(err.message));
        else if (!data.session)
          setInfo("Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.");
        else navigate("/", { replace: true });
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: appUrl,
        });
        if (err) setError(translateError(err.message));
        else
          setInfo(
            "Si cette adresse existe, un e-mail de réinitialisation a été envoyé. Ouvrez le lien dans ce même navigateur."
          );
      }
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "login" ? "Connexion" : mode === "signup" ? "Créer un compte" : "Mot de passe oublié";

  return (
    <div className="auth-wrap">
      <div className="auth-brand">Parfum Manager</div>
      <form className="card" onSubmit={onSubmit}>
        <h1>{title}</h1>

        {mode === "signup" && (
          <label className="field">
            <span>Nom complet</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}

        <label className="field">
          <span>Adresse e-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        {mode !== "forgot" && (
          <label className="field">
            <span>Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </label>
        )}

        {error && <p className="msg error">{error}</p>}
        {info && <p className="msg ok">{info}</p>}

        <button className="btn" type="submit" disabled={busy}>
          {busy
            ? "Veuillez patienter…"
            : mode === "login"
            ? "Se connecter"
            : mode === "signup"
            ? "Créer mon compte"
            : "Envoyer le lien"}
        </button>

        <div className="links">
          {mode !== "login" && (
            <button type="button" className="link" onClick={() => switchMode("login")}>
              Retour à la connexion
            </button>
          )}
          {mode === "login" && (
            <>
              <button type="button" className="link" onClick={() => switchMode("signup")}>
                Créer un compte
              </button>
              <button type="button" className="link" onClick={() => switchMode("forgot")}>
                Mot de passe oublié ?
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
