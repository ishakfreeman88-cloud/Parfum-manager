import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { useCompany } from "../company/CompanyContext";
import type { Role } from "../company/CompanyContext";
import { formatDateTime } from "../lib/format";

const roleLabels: Record<Role, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
  seller: "Vendeur",
  reader: "Lecteur",
};
const roles: Role[] = ["admin", "manager", "seller", "reader"];

type Member = { user_id: string; role: Role; status: "active" | "revoked" };
type Invitation = { id: string; code: string; role: Role; expires_at: string };
type DbError = { message: string; code?: string };

// Les messages des fonctions SQL (code P0001) sont déjà rédigés en français.
function errText(err: DbError): string {
  return err.code === "P0001" ? err.message : "Une erreur est survenue. Réessayez.";
}

export default function Team() {
  const { user } = useAuth();
  const { company, role } = useCompany();
  const isAdmin = role === "admin";

  const [members, setMembers] = useState<Member[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [newRole, setNewRole] = useState<Role>("seller");
  const [newCode, setNewCode] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !company) return;
    setLoading(true);
    const { data: m, error: e1 } = await supabase
      .from("company_members")
      .select("user_id, role, status")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });
    if (e1) {
      setError(errText(e1));
      setLoading(false);
      return;
    }
    const list = (m ?? []) as Member[];
    setMembers(list);

    const ids = list.map((x) => x.user_id);
    if (ids.length > 0) {
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (p ?? []).forEach((r: { id: string; full_name: string | null }) => {
        map[r.id] = r.full_name ?? "";
      });
      setNames(map);
    }

    if (isAdmin) {
      const { data: inv } = await supabase
        .from("invitations")
        .select("id, code, role, expires_at")
        .eq("company_id", company.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      setInvites((inv ?? []) as Invitation[]);
    }
    setLoading(false);
  }, [company, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  // Exécute une action une seule fois à la fois (protection contre le double clic).
  async function act(key: string, call: () => PromiseLike<{ error: DbError | null }>) {
    if (busyKey) return;
    setBusyKey(key);
    setError("");
    const { error: err } = await call();
    if (err) setError(errText(err));
    await load();
    setBusyKey("");
  }

  async function createInvite() {
    if (busyKey || !supabase || !company) return;
    setBusyKey("invite");
    setError("");
    setNewCode("");
    setCopied(false);
    const { data, error: err } = await supabase.rpc("create_invitation", {
      p_company: company.id,
      p_role: newRole,
    });
    if (err) setError(errText(err));
    else setNewCode(String(data));
    await load();
    setBusyKey("");
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (!company || !supabase) return null;
  const db = supabase;

  const active = members.filter((x) => x.status === "active");
  const revokedCount = members.filter((x) => x.status === "revoked").length;

  return (
    <section>
      <h1>Équipe</h1>
      {error && <p className="msg error">{error}</p>}
      {loading && <p className="muted">Chargement…</p>}

      <div className="card">
        <h2>Membres actifs ({active.length})</h2>
        {active.map((mem) => {
          const isMe = mem.user_id === user?.id;
          return (
            <div className="row" key={mem.user_id}>
              <div className="row-main">
                <strong>{names[mem.user_id] || "Sans nom"}</strong>
                {isMe && <span className="muted"> (vous)</span>}
                {!isAdmin || isMe ? (
                  <div className="muted">{roleLabels[mem.role]}</div>
                ) : (
                  <select
                    value={mem.role}
                    disabled={Boolean(busyKey)}
                    onChange={(e) =>
                      act("role" + mem.user_id, () =>
                        db.rpc("set_member_role", {
                          p_company: company.id,
                          p_user: mem.user_id,
                          p_role: e.target.value,
                        })
                      )
                    }
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>{roleLabels[r]}</option>
                    ))}
                  </select>
                )}
              </div>
              {isAdmin && !isMe && (
                <button
                  type="button"
                  className="btn-small danger"
                  disabled={Boolean(busyKey)}
                  onClick={() => {
                    if (window.confirm("Retirer l'accès de ce membre ?")) {
                      act("revoke" + mem.user_id, () =>
                        db.rpc("revoke_member", { p_company: company.id, p_user: mem.user_id })
                      );
                    }
                  }}
                >
                  Retirer
                </button>
              )}
            </div>
          );
        })}
        {revokedCount > 0 && <p className="muted">Accès retirés : {revokedCount}</p>}
      </div>

      {isAdmin && (
        <div className="card">
          <h2>Inviter un membre</h2>
          <label className="field">
            <span>Rôle du nouveau membre</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {roles.map((r) => (
                <option key={r} value={r}>{roleLabels[r]}</option>
              ))}
            </select>
          </label>
          <button className="btn" type="button" disabled={Boolean(busyKey)} onClick={createInvite}>
            {busyKey === "invite" ? "Veuillez patienter…" : "Générer un code d'invitation"}
          </button>

          {newCode && (
            <div className="msg ok">
              <p>Code à transmettre en privé (valable 7 jours, utilisable une seule fois) :</p>
              <p className="code">{newCode}</p>
              <button type="button" className="btn-small" onClick={() => copyCode(newCode)}>
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          )}

          {invites.length > 0 && <h2 className="mt">Invitations en attente</h2>}
          {invites.map((inv) => (
            <div className="row" key={inv.id}>
              <div className="row-main">
                <span className="code-small">{inv.code}</span>
                <div className="muted">
                  {roleLabels[inv.role]} · expire le {formatDateTime(inv.expires_at)}
                </div>
              </div>
              <button
                type="button"
                className="btn-small danger"
                disabled={Boolean(busyKey)}
                onClick={() => act("cancel" + inv.id, () => db.rpc("cancel_invitation", { p_id: inv.id }))}
              >
                Annuler
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
