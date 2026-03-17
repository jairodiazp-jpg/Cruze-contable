import { useState, useEffect, useCallback } from "react";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { copyTextToClipboard } from "@/lib/utils";
import { Users, Search, RefreshCw, ShieldCheck, UserCog, User, Mail, Send, Copy, XCircle } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { resolveEffectiveRole } from "@/lib/roles";

interface UserWithRole {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  role: "admin" | "technician" | "user";
  role_id: string;
}

interface InvitationRow {
  id: string;
  email: string;
  role: "admin" | "technician" | "user";
  status: "pending" | "accepted" | "revoked" | "expired";
  token: string;
  created_at: string;
  expires_at: string;
}

type CompanyUsersAction = "invite-user" | "list-invitations" | "revoke-invitation";

interface CompanyUsersBaseResponse {
  error?: string;
  message?: string;
}

interface ListInvitationsResponse extends CompanyUsersBaseResponse {
  invitations?: InvitationRow[];
}

interface InviteUserResponse extends CompanyUsersBaseResponse {
  token?: string;
  invitation?: {
    token?: string;
  };
  already_pending?: boolean;
  email_delivery?: {
    attempted?: boolean;
    sent?: boolean;
  };
}

type CompanyUsersResponse = CompanyUsersBaseResponse | ListInvitationsResponse | InviteUserResponse;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null ? (value as JsonRecord) : null;

const getStringField = (value: unknown, field: string): string | null => {
  const record = asRecord(value);
  const fieldValue = record?.[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
};

const extractEdgeFunctionError = async (error: unknown, data: unknown, fallback: string): Promise<string> => {
  const dataRecord = asRecord(data);
  const errorFromData = dataRecord?.error;
  if (typeof errorFromData === "string" && errorFromData.trim()) {
    return errorFromData;
  }

  const nestedErrorMessage = getStringField(errorFromData, "message");
  if (nestedErrorMessage) {
    return nestedErrorMessage;
  }

  const errorRecord = asRecord(error);
  const context = errorRecord?.context;
  if (context && typeof context === "object" && "clone" in context) {
    try {
      const contextClone = (context as { clone: () => { json: () => Promise<unknown> } }).clone();
      const payload = await contextClone.json();
      const payloadError = getStringField(payload, "error");
      if (payloadError) {
        return payloadError;
      }
      const payloadMessage = getStringField(payload, "message");
      if (payloadMessage) {
        return payloadMessage;
      }
    } catch {
      // Ignore parse errors and fallback below.
    }
  }

  const errorMessage = getStringField(error, "message");
  if (errorMessage) {
    return errorMessage;
  }

  return fallback;
};

const isInvalidJwtError = (message: string | null | undefined) =>
  typeof message === "string" && /invalid\s+jwt|jwt\s+expired|auth\s+token/i.test(message);

const invokeCompanyUsers = async (body: { action: CompanyUsersAction; [key: string]: unknown }) => {
  let response = await supabase.functions.invoke("company-users", { body });

  const firstErrorMessage = await extractEdgeFunctionError(
    response.error,
    response.data,
    response.error?.message ?? "",
  );

  if (!isInvalidJwtError(firstErrorMessage)) {
    return response;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return response;
  }

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) {
    return response;
  }

  response = await supabase.functions.invoke("company-users", { body });
  return response;
};

const roleLabels: Record<string, string> = { admin: "Administrador", technician: "Técnico", user: "Usuario" };
const roleIcons: Record<string, typeof ShieldCheck> = { admin: ShieldCheck, technician: UserCog, user: User };
const roleBadgeClass: Record<string, string> = {
  admin: "bg-red-500/10 text-red-400 border-red-500/30",
  technician: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  user: "bg-muted text-muted-foreground border-border",
};

export default function UserRoles() {
  const { companyId, loading: companyLoading } = useCompany();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "technician" | "user">("user");
  const [inviting, setInviting] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!companyId) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Get profiles + roles
    let profilesQuery = supabase.from("profiles").select("id, email, full_name, created_at");
    if (companyId) {
      profilesQuery = profilesQuery.eq("company_id", companyId);
    }

    const { data: profiles, error: pErr } = await profilesQuery;
    const profileIds = (profiles || []).map((p) => p.id);

    let roles: Tables<"user_roles">[] = [];
    let rErr: PostgrestError | null = null;
    if (profileIds.length > 0) {
      const rolesResult = await supabase.from("user_roles").select("id, user_id, role").in("user_id", profileIds);
      roles = rolesResult.data || [];
      rErr = rolesResult.error;
    }

    if (pErr || rErr) {
      toast({ title: "Error", description: (pErr || rErr)?.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const merged: UserWithRole[] = (profiles || []).map((p) => {
      const roleEntries = (roles || []).filter((r) => r.user_id === p.id);
      const effectiveRole = resolveEffectiveRole(roleEntries);
      const roleRecord = roleEntries.find((r) => r.role === effectiveRole) ?? roleEntries[0];
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        created_at: p.created_at,
        role: effectiveRole,
        role_id: roleRecord?.id || "",
      };
    });

    setUsers(merged);
    setLoading(false);
  }, [companyId, toast]);

  const fetchInvitations = useCallback(async () => {
    if (!companyId) {
      setInvitations([]);
      setLoadingInvitations(false);
      return;
    }

    setLoadingInvitations(true);
    const { data, error } = await invokeCompanyUsers({ action: "list-invitations" });
    const payload = (data as CompanyUsersResponse | null) ?? null;
    if (error || payload?.error) {
      const description = await extractEdgeFunctionError(error, data, "No se pudieron cargar las invitaciones.");
      toast({ title: "Error cargando invitaciones", description, variant: "destructive" });
    } else {
      setInvitations(((payload as ListInvitationsResponse | null)?.invitations ?? []) as InvitationRow[]);
    }
    setLoadingInvitations(false);
  }, [companyId, toast]);

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) return;
    if (!companyId) {
      toast({
        title: "Sin contexto de empresa",
        description: "Tu usuario no tiene empresa asignada aun. Recarga la sesion e intenta nuevamente.",
        variant: "destructive",
      });
      return;
    }

    setInviting(true);
    setLastToken(null);
    const { data, error } = await invokeCompanyUsers({
      action: "invite-user",
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
    });
    const payload = (data as InviteUserResponse | null) ?? null;
    if (error || payload?.error) {
      const description = await extractEdgeFunctionError(error, data, "No se pudo crear la invitacion.");
      toast({
        title: "Error al invitar",
        description: isInvalidJwtError(description)
          ? "Tu sesion expiró. Cierra sesión e inicia sesión nuevamente para continuar."
          : description,
        variant: "destructive",
      });
    } else {
      const emailDelivery = payload?.email_delivery;
      const emailNotice = emailDelivery?.sent
        ? "Tambien se envio por correo automaticamente."
        : "No se pudo enviar por correo; comparte el enlace manualmente.";

      setLastToken(payload?.token ?? payload?.invitation?.token ?? null);
      setInviteEmail("");
      toast({
        title: payload?.already_pending ? "Invitacion existente" : "Invitacion creada",
        description: payload?.already_pending
          ? `Ya habia una invitacion pendiente para este email y se reutilizo. ${emailNotice}`
          : `Comparte el enlace con el usuario. ${emailNotice}`,
      });
      fetchInvitations();
    }
    setInviting(false);
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!companyId) {
      toast({
        title: "Sin contexto de empresa",
        description: "Tu usuario no tiene empresa asignada aun. Recarga la sesion e intenta nuevamente.",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await invokeCompanyUsers({ action: "revoke-invitation", invitation_id: invitationId });
    const payload = (data as CompanyUsersResponse | null) ?? null;
    if (error || payload?.error) {
      const description = await extractEdgeFunctionError(error, data, "No se pudo revocar la invitacion.");
      toast({ title: "Error", description, variant: "destructive" });
    } else {
      toast({ title: "Invitación revocada" });
      fetchInvitations();
    }
  };

  useEffect(() => {
    if (companyLoading) {
      return;
    }

    if (!companyId) {
      setUsers([]);
      setInvitations([]);
      setLoading(false);
      setLoadingInvitations(false);
      return;
    }

    fetchUsers();
    fetchInvitations();
  }, [companyId, companyLoading, fetchInvitations, fetchUsers]);

  const handleRoleChange = async (userId: string, _roleId: string, newRole: Enums<"app_role">) => {
    if (!users.some((u) => u.id === userId)) {
      toast({ title: "Usuario fuera de alcance", variant: "destructive" });
      return;
    }

    // Delete all existing roles for the user, then insert the new one.
    // This avoids UNIQUE(user_id, role) violations regardless of current DB state.
    const { error: delError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (delError) {
      toast({ title: "Error", description: delError.message, variant: "destructive" });
      return;
    }

    const { error: insError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole });

    if (insError) {
      toast({ title: "Error", description: insError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Rol actualizado", description: `Rol cambiado a ${roleLabels[newRole]}` });
    fetchUsers();
  };

  const filtered = users.filter((u) =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const adminCount = users.filter((u) => u.role === "admin").length;
  const techCount = users.filter((u) => u.role === "technician").length;
  const userCount = users.filter((u) => u.role === "user").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Roles</h1>
          <p className="text-muted-foreground text-sm">Asigna roles y permisos a los usuarios del sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers}><RefreshCw className="h-4 w-4 mr-1" /> Actualizar</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Usuarios</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{users.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-red-400" /> Admins</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-400">{adminCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><UserCog className="h-3 w-3 text-blue-400" /> Técnicos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-400">{techCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Usuarios</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-foreground">{userCount}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Usuarios Registrados</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Cargando...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No hay usuarios registrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol Actual</TableHead>
                  <TableHead>Registrado</TableHead>
                  <TableHead>Cambiar Rol</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const RoleIcon = roleIcons[u.role] || User;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{u.full_name || "Sin nombre"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={roleBadgeClass[u.role]}>
                          <RoleIcon className="h-3 w-3 mr-1" />
                          {roleLabels[u.role]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("es-ES")}
                      </TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, u.role_id, v as Enums<"app_role">)}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="technician">Técnico</SelectItem>
                            <SelectItem value="user">Usuario</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-4 w-4" /> Invitar Usuario
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_10rem_auto] gap-3">
            <Input
              placeholder="correo@empresa.com"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInviteUser()}
              className="w-full"
            />
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "technician" | "user")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="technician">Técnico</SelectItem>
                <SelectItem value="user">Usuario</SelectItem>
              </SelectContent>
            </Select>
            <Button className="w-full lg:w-auto" onClick={handleInviteUser} disabled={inviting || !inviteEmail.trim()}>
              <Send className="h-4 w-4 mr-1" /> {inviting ? "Enviando..." : "Invitar"}
            </Button>
          </div>
          {lastToken && (
            <div className="p-3 bg-muted rounded-md flex flex-col sm:flex-row items-start sm:items-center gap-2 text-sm">
              <p className="flex-1 font-mono text-xs break-all">
                {window.location.origin}/aceptar-invitacion?token={lastToken}
              </p>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  const copied = await copyTextToClipboard(`${window.location.origin}/aceptar-invitacion?token=${lastToken}`);
                  if (!copied) {
                    toast({ title: "Error", description: "No se pudo copiar el enlace de invitación.", variant: "destructive" });
                    return;
                  }

                  toast({ title: "Enlace copiado" });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Invitaciones</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchInvitations}>
              <RefreshCw className="h-4 w-4 mr-1" /> Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingInvitations ? (
            <p className="text-muted-foreground text-center py-8">Cargando...</p>
          ) : invitations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>No hay invitaciones</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleBadgeClass[inv.role]}>
                        {roleLabels[inv.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          inv.status === "pending"
                            ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                            : inv.status === "accepted"
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }
                      >
                        {inv.status === "pending"
                          ? "Pendiente"
                          : inv.status === "accepted"
                          ? "Aceptada"
                          : inv.status === "revoked"
                          ? "Revocada"
                          : "Expirada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell>
                      {inv.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => handleRevokeInvitation(inv.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
