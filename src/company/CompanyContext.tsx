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

type Row = {
  role: Role;
  companies: Company | Company[] | null;
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
    const { data, error: err } = await supabase
      .from("company_members")
      .select("role, companies(id, name)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);

    if (err) {
      setError("Impossible de charger votre entreprise.");
      setCompany(null);
      setRole(null);
    } else {
      const row = (data as unknown as Row[] | null)?.[0];
      const c = row ? (Array.isArray(row.companies) ? row.companies[0] : row.companies) : null;
      setCompany(c ?? null);
      setRole(c && row ? row.role : null);
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
