import { useState, useEffect } from 'react';
import { listCompanies, getCompanyByDomain } from '../services/company.service';
import type { Company } from '../types/company.types';

export function useCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCompanies()
      .then(setCompanies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { companies, loading, error, getCompanyByDomain };
}
