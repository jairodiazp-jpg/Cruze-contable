import { useAuth } from "@/contexts/AuthContext";

export function useCompany() {
  const { companyId, companyName, loading } = useAuth();
  return { companyId, companyName, loading };
}
