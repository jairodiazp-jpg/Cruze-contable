export function applyCompanyScope<T extends { eq: (column: string, value: string) => T }>(query: T, companyId: string | null | undefined): T {
  return companyId ? query.eq("company_id", companyId) : query;
}