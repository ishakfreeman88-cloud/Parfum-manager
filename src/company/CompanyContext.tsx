import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";

export type Role = "admin" | "manager" | "seller" | "reader";
export type Company = { id: string; name: string };

type CompanyState = {
  company: Company | null;
  role: Role | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const CompanyContext = createContext<CompanyState | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [company, setCompany] = useState<Company | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setCompany(null);
      setRole(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setCompany(null);
    setRole(null);

    // 1) Mon appartenance active (la plus ancienne)
    const { data: members, error: err1 } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);

    if (err1) {
      setError("Lecture des membres impossible : " + err1.message);
      setLoading(false);
      return;
    }

    const m = members?.[0];
    if (m) {
      // 2) L'entreprise correspondante
      const { data: c, error: err2 } = await supabase
        .from("companies")
        .select("id, name")
        .eq("id", m.company_id)
        .maybeSingle();

      if (err2) {
        setError("Lecture de l'entreprise impossible : " + err2.message);
      } else if (!c) {
        setError("Membre trouvé, mais l'entreprise n'est pas visible (règle d'accès).");
      } else {
        setCompany(c as Company);
        setRole(m.role as Role);
      }
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <CompanyContext.Provider value={{ company, role, loading, error, refresh: load }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany(): CompanyState {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany doit être utilisé dans CompanyProvider");
  return ctx;
}
