import { supabase } from '@/integrations/supabase/client';
import type { Company } from '../types/company.types';

export async function getCompanyByDomain(domain: string): Promise<Company | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('domain', domain)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Company | null;
}

export async function listCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*');
  if (error) throw new Error(error.message);
  return data as Company[];
}
