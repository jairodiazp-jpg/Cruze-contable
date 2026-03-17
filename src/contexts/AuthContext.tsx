import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { resolveEffectiveRole, type AppRole } from "@/lib/roles";

interface RepairContextResponse {
  error?: unknown;
  company?: {
    id?: string | null;
  } | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  companyId: string | null;
  companyName: string | null;
  isAdmin: boolean;
  isTechnician: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  role: null,
  companyId: null,
  companyName: null,
  isAdmin: false,
  isTechnician: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const attemptCompanyRepair = useCallback(async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("company-users", {
          body: { action: "repair-context" },
        }),
        10000,
        "Timeout repairing company context"
      );

      const payload = data as RepairContextResponse | null;

      if (error || payload?.error) {
        return false;
      }

      return Boolean(payload?.company?.id);
    } catch {
      return false;
    }
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    try {
      let [{ data: profile }, { data: roleRows }] = await withTimeout(
        Promise.all([
          supabase.from("profiles").select("company_id").eq("id", uid).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", uid),
        ]),
        10000,
        "Timeout loading profile"
      );

      if (!profile?.company_id) {
        const repaired = await attemptCompanyRepair();
        if (repaired) {
          [{ data: profile }, { data: roleRows }] = await withTimeout(
            Promise.all([
              supabase.from("profiles").select("company_id").eq("id", uid).maybeSingle(),
              supabase.from("user_roles").select("role").eq("user_id", uid),
            ]),
            10000,
            "Timeout reloading repaired profile"
          );
        }
      }

      const cid = profile?.company_id ?? null;
      setCompanyId(cid);
      setRole(resolveEffectiveRole(roleRows));

      if (cid) {
        const { data: company } = await withTimeout(
          supabase
            .from("companies")
            .select("name")
            .eq("id", cid)
            .maybeSingle(),
          10000,
          "Timeout loading company"
        );
        setCompanyName(company?.name ?? null);
      } else {
        setCompanyName(null);
      }
    } catch (error) {
      console.error("Failed to load auth profile", error);
      setRole(null);
      setCompanyId(null);
      setCompanyName(null);
    }
  }, [attemptCompanyRepair]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            await loadProfile(session.user.id);
          } else {
            setRole(null);
            setCompanyId(null);
            setCompanyName(null);
          }
        } finally {
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await withTimeout(loadProfile(session.user.id), 12000, "Timeout initializing session");
        } else {
          setRole(null);
          setCompanyId(null);
          setCompanyName(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        role,
        companyId,
        companyName,
        isAdmin: role === "admin",
        isTechnician: role === "technician",
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
