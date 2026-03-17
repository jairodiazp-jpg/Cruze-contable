export type AppRole = "admin" | "technician" | "user";

const rolePriority: Record<AppRole, number> = {
  admin: 3,
  technician: 2,
  user: 1,
};

export function resolveEffectiveRole(roles: Array<{ role: string | null | undefined }> | null | undefined): AppRole {
  let effectiveRole: AppRole = "user";

  for (const entry of roles ?? []) {
    const role = entry.role;
    if (role === "admin" || role === "technician" || role === "user") {
      if (rolePriority[role] > rolePriority[effectiveRole]) {
        effectiveRole = role;
      }
    }
  }

  return effectiveRole;
}