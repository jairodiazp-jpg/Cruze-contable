import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = new Set(["admin", "technician", "user"]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateInvitationToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function extractEmailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const separatorIndex = normalized.lastIndexOf("@");
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return "";
  }

  return normalized.slice(separatorIndex + 1);
}

function parseDomainRoleRules() {
  const raw = (Deno.env.get("CORPORATE_DOMAIN_ROLE_RULES") || "").trim();
  if (!raw) {
    return new Map<string, string>();
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rules = new Map<string, string>();

    for (const [domainRule, roleValue] of Object.entries(parsed)) {
      const normalizedDomain = domainRule.trim().toLowerCase();
      const normalizedRole = typeof roleValue === "string" ? roleValue.trim().toLowerCase() : "";
      if (!normalizedDomain || !ALLOWED_ROLES.has(normalizedRole)) {
        continue;
      }
      rules.set(normalizedDomain, normalizedRole);
    }

    return rules;
  } catch (error) {
    console.error("Invalid CORPORATE_DOMAIN_ROLE_RULES JSON", error);
    return new Map<string, string>();
  }
}

function resolveRoleByDomain(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain) {
    return "user";
  }

  const rules = parseDomainRoleRules();
  const directMatchRole = rules.get(normalizedDomain);
  if (directMatchRole) {
    return directMatchRole;
  }

  for (const [ruleDomain, mappedRole] of rules.entries()) {
    if (ruleDomain.startsWith("*.")) {
      const suffix = ruleDomain.slice(1);
      if (normalizedDomain.endsWith(suffix)) {
        return mappedRole;
      }
    }
  }

  return "user";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeMetadataText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugifyText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type InvitationEmailDelivery = {
  attempted: boolean;
  sent: boolean;
  reason?: string;
};

function resolveAppBaseUrl(req: Request) {
  const configuredUrl = (Deno.env.get("APP_PUBLIC_URL") || Deno.env.get("SITE_URL") || "").trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const requestOrigin = req.headers.get("origin") || "";
  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, "");
  }

  return "";
}

function buildInvitationLink(req: Request, token: string) {
  const baseUrl = resolveAppBaseUrl(req);
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/aceptar-invitacion?token=${token}`;
}

async function sendInvitationEmail(params: {
  req: Request;
  to: string;
  role: string;
  companyName: string;
  inviterEmail: string;
  token: string;
}): Promise<InvitationEmailDelivery> {
  const resendApiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  const fromEmail = (Deno.env.get("INVITATION_FROM_EMAIL") || "").trim();
  const invitationLink = buildInvitationLink(params.req, params.token);

  if (!resendApiKey || !fromEmail) {
    return { attempted: false, sent: false, reason: "email_service_not_configured" };
  }

  if (!invitationLink) {
    return { attempted: false, sent: false, reason: "missing_app_base_url" };
  }

  const roleLabel =
    params.role === "admin"
      ? "Administrador"
      : params.role === "technician"
      ? "Tecnico"
      : "Usuario";

  const subject = `Invitacion a ${params.companyName} en InteliSupp`;
  const text = [
    `Hola,`,
    ``,
    `${params.inviterEmail} te invito a unirte a ${params.companyName} con rol ${roleLabel}.`,
    ``,
    `Acepta tu invitacion aqui: ${invitationLink}`,
    ``,
    `Este enlace vence en 7 dias.`,
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin-bottom: 12px;">Invitacion a ${params.companyName}</h2>
      <p>${params.inviterEmail} te invito a unirte con el rol <strong>${roleLabel}</strong>.</p>
      <p style="margin: 20px 0;">
        <a href="${invitationLink}" style="display: inline-block; background: #111827; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 6px;">Aceptar invitacion</a>
      </p>
      <p>Si el boton no funciona, copia y pega este enlace:</p>
      <p><a href="${invitationLink}">${invitationLink}</a></p>
      <p style="color: #6b7280; font-size: 13px;">Este enlace vence en 7 dias.</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Invitation email delivery failed", response.status, errorText);
      return { attempted: true, sent: false, reason: `provider_error_${response.status}` };
    }

    return { attempted: true, sent: true };
  } catch (error) {
    console.error("Invitation email request failed", error);
    return { attempted: true, sent: false, reason: "provider_request_failed" };
  }
}

async function safeReadJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function requireAuthenticatedUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: jsonResponse({ error: "Missing Authorization header" }, 401) };
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) {
    return { error: jsonResponse({ error: "Invalid auth token" }, 401) };
  }

  return { user: data.user };
}

async function requireAdminContext(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const authResult = await requireAuthenticatedUser(req, supabaseUrl, anonKey);
  if (authResult.error) {
    return authResult;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", authResult.user.id)
    .single();

  if (profileError || !profile?.company_id) {
    return { error: jsonResponse({ error: "Authenticated user is not linked to a company" }, 403) };
  }

  const { data: adminRole, error: adminRoleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", authResult.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (adminRoleError) {
    return { error: jsonResponse({ error: "Could not verify admin permissions" }, 500) };
  }

  if (!adminRole) {
    return { error: jsonResponse({ error: "Only company administrators can manage internal users" }, 403) };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, active, max_users")
    .eq("id", profile.company_id)
    .single();

  if (companyError || !company) {
    return { error: jsonResponse({ error: "Company context not found" }, 404) };
  }

  if (!company.active) {
    return { error: jsonResponse({ error: "Company is inactive" }, 403) };
  }

  return {
    error: null,
    user: authResult.user,
    company,
    supabase,
  };
}

async function getCompanyById(supabase: ReturnType<typeof createClient>, companyId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, active, max_users")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data || !data.active) {
    return null;
  }

  return data;
}

async function resolveInvitationCompanyContext(
  supabase: ReturnType<typeof createClient>,
  userEmail: string,
) {
  const { data, error } = await supabase
    .from("company_invitations")
    .select("id, company_id, role, status, expires_at, accepted_at, created_at")
    .ilike("email", userEmail)
    .in("status", ["accepted", "pending"]);

  if (error || !data || data.length === 0) {
    return null;
  }

  const ranked = [...data].sort((left, right) => {
    const leftScore = left.status === "accepted" ? 0 : 1;
    const rightScore = right.status === "accepted" ? 0 : 1;
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const leftDate = new Date(left.accepted_at ?? left.created_at).getTime();
    const rightDate = new Date(right.accepted_at ?? right.created_at).getTime();
    return rightDate - leftDate;
  });

  for (const invitation of ranked) {
    if (invitation.status === "pending" && new Date(invitation.expires_at) <= new Date()) {
      continue;
    }

    const company = await getCompanyById(supabase, invitation.company_id);
    if (!company) {
      continue;
    }

    return {
      company,
      role: invitation.role,
      source: "invitation" as const,
      invitationId: invitation.id,
      invitationStatus: invitation.status,
    };
  }

  return null;
}

async function resolveDomainCompanyContext(
  supabase: ReturnType<typeof createClient>,
  userEmail: string,
) {
  const domain = extractEmailDomain(userEmail);
  if (!domain) {
    return null;
  }

  const { data: corporateDomain, error } = await supabase
    .from("corporate_domains")
    .select("company_id, status")
    .eq("domain_name", domain)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !corporateDomain?.company_id) {
    const { data: fallbackCompany, error: fallbackError } = await supabase
      .from("companies")
      .select("id, name, active, max_users")
      .ilike("domain", domain)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (fallbackError || !fallbackCompany) {
      return null;
    }

    return {
      company: fallbackCompany,
      role: resolveRoleByDomain(domain),
      source: "domain-match" as const,
    };
  }

  const company = await getCompanyById(supabase, corporateDomain.company_id);
  if (!company) {
    return null;
  }

  return {
    company,
    role: resolveRoleByDomain(domain),
    source: "domain-match" as const,
  };
}

async function resolveSignupCompanyContext(
  supabase: ReturnType<typeof createClient>,
  user: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"],
) {
  const companySlug = normalizeMetadataText(user.raw_user_meta_data?.company_slug);
  const companyName = normalizeMetadataText(user.raw_user_meta_data?.company_name);

  if (companySlug) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, active, max_users")
      .eq("slug", companySlug)
      .limit(1)
      .maybeSingle();

    if (!error && data?.active) {
      return {
        company: data,
        role: "admin",
        source: "signup-metadata" as const,
      };
    }
  }

  if (!companyName) {
    return null;
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, active, max_users")
    .ilike("name", companyName)
    .limit(2);

  if (error || !data) {
    return null;
  }

  const activeMatches = data.filter((company) => company.active);
  if (activeMatches.length !== 1) {
    return null;
  }

  return {
    company: activeMatches[0],
    role: "admin",
    source: "signup-metadata" as const,
  };
}

async function resolveUserCompanyContext(
  supabase: ReturnType<typeof createClient>,
  user: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"],
) {
  const userEmail = normalizeEmail(user.email ?? "");
  if (userEmail) {
    const invitationContext = await resolveInvitationCompanyContext(supabase, userEmail);
    if (invitationContext) {
      return invitationContext;
    }

    const domainContext = await resolveDomainCompanyContext(supabase, userEmail);
    if (domainContext) {
      return domainContext;
    }
  }

  return resolveSignupCompanyContext(supabase, user);
}

async function createInitialCompanyContext(
  supabase: ReturnType<typeof createClient>,
  user: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"],
) {
  const userEmail = normalizeEmail(user.email ?? "");
  const metadataName = normalizeMetadataText(user.raw_user_meta_data?.company_name);
  const emailPrefix = userEmail.split("@")[0] || "empresa";
  const companyName = metadataName || `Empresa ${emailPrefix}`;

  const metadataSlug = slugifyText(normalizeMetadataText(user.raw_user_meta_data?.company_slug));
  const baseSlug = metadataSlug || slugifyText(emailPrefix) || `empresa-${crypto.randomUUID().slice(0, 8)}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: companyName,
        slug,
      })
      .select("id, name, active, max_users")
      .maybeSingle();

    if (!error && data?.active) {
      return {
        company: data,
        role: "admin",
        source: "auto-provision" as const,
      };
    }

    if (!error || !error.message.toLowerCase().includes("duplicate")) {
      throw error;
    }
  }

  throw new Error("Could not allocate a unique company slug");
}

async function ensureUserRole(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  role: string,
) {
  if (!ALLOWED_ROLES.has(role)) {
    return;
  }

  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role })
    .select("id")
    .maybeSingle();

  if (error && !error.message.toLowerCase().includes("duplicate")) {
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const body = await safeReadJson(req);
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean);
    const pathAction = path[path.length - 1];
    const bodyAction = typeof body?.action === "string" ? body.action.trim() : "";
    const action = pathAction === "company-users" ? bodyAction : bodyAction || pathAction;
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === "accept-invitation") {
      const authResult = await requireAuthenticatedUser(req, supabaseUrl, anonKey);
      if (authResult.error) {
        return authResult.error;
      }

      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!token) {
        return jsonResponse({ error: "token is required" }, 400);
      }

      const { data: invitation, error: invitationError } = await serviceClient
        .from("company_invitations")
        .select("id, company_id, email, role, status, expires_at")
        .eq("token", token)
        .maybeSingle();

      if (invitationError) {
        return jsonResponse({ error: invitationError.message }, 500);
      }

      if (!invitation) {
        return jsonResponse({ error: "Invitation not found" }, 404);
      }

      if (invitation.status !== "pending") {
        return jsonResponse({ error: "Invitation is no longer pending" }, 409);
      }

      if (new Date(invitation.expires_at) <= new Date()) {
        await serviceClient
          .from("company_invitations")
          .update({ status: "expired" })
          .eq("id", invitation.id);

        return jsonResponse({ error: "Invitation has expired" }, 410);
      }

      const userEmail = normalizeEmail(authResult.user.email ?? "");
      if (!userEmail || userEmail !== normalizeEmail(invitation.email)) {
        return jsonResponse({ error: "Invitation email does not match the authenticated user" }, 403);
      }

      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .select("company_id")
        .eq("id", authResult.user.id)
        .single();

      if (profileError || !profile) {
        return jsonResponse({ error: "Authenticated profile not found" }, 404);
      }

      if (profile.company_id && profile.company_id !== invitation.company_id) {
        return jsonResponse({ error: "Authenticated user already belongs to a different company" }, 409);
      }

      const { data: company, error: companyError } = await serviceClient
        .from("companies")
        .select("id, name, active, max_users")
        .eq("id", invitation.company_id)
        .single();

      if (companyError || !company) {
        return jsonResponse({ error: "Target company not found" }, 404);
      }

      if (!company.active) {
        return jsonResponse({ error: "Target company is inactive" }, 403);
      }

      const { count, error: countError } = await serviceClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id);

      if (countError) {
        return jsonResponse({ error: "Could not validate company capacity" }, 500);
      }

      if (!profile.company_id && (count ?? 0) >= company.max_users) {
        return jsonResponse({ error: "Company user limit reached", max_users: company.max_users }, 409);
      }

      const { error: profileUpdateError } = await serviceClient
        .from("profiles")
        .update({ company_id: company.id })
        .eq("id", authResult.user.id);

      if (profileUpdateError) {
        return jsonResponse({ error: profileUpdateError.message }, 500);
      }

      const { error: deleteRolesError } = await serviceClient
        .from("user_roles")
        .delete()
        .eq("user_id", authResult.user.id);

      if (deleteRolesError) {
        return jsonResponse({ error: deleteRolesError.message }, 500);
      }

      const { error: insertRoleError } = await serviceClient
        .from("user_roles")
        .insert({ user_id: authResult.user.id, role: invitation.role });

      if (insertRoleError) {
        return jsonResponse({ error: insertRoleError.message }, 500);
      }

      const { error: invitationUpdateError } = await serviceClient
        .from("company_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invitation.id);

      if (invitationUpdateError) {
        return jsonResponse({ error: invitationUpdateError.message }, 500);
      }

      return jsonResponse({
        company: { id: company.id, name: company.name },
        membership: { role: invitation.role },
      });
    }

    if (action === "repair-context") {
      const authResult = await requireAuthenticatedUser(req, supabaseUrl, anonKey);
      if (authResult.error) {
        return authResult.error;
      }

      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .select("company_id")
        .eq("id", authResult.user.id)
        .maybeSingle();

      if (profileError) {
        return jsonResponse({ error: profileError.message }, 500);
      }

      if (profile?.company_id) {
        const company = await getCompanyById(serviceClient, profile.company_id);
        if (!company) {
          return jsonResponse({ error: "Company context not found" }, 404);
        }

        return jsonResponse({
          repaired: false,
          company: { id: company.id, name: company.name },
        });
      }

      let context = await resolveUserCompanyContext(serviceClient, authResult.user);
      if (!context) {
        try {
          context = await createInitialCompanyContext(serviceClient, authResult.user);
        } catch (error) {
          const message = error instanceof Error ? error.message : "No company context could be inferred for the authenticated user";
          return jsonResponse({ error: message }, 500);
        }
      }

      const normalizedUserEmail = normalizeEmail(authResult.user.email ?? "");
      const { error: updateProfileError } = await serviceClient
        .from("profiles")
        .upsert({
          id: authResult.user.id,
          email: normalizedUserEmail || null,
          company_id: context.company.id,
        }, {
          onConflict: "id",
        });

      if (updateProfileError) {
        return jsonResponse({ error: updateProfileError.message }, 500);
      }

      try {
        await ensureUserRole(serviceClient, authResult.user.id, context.role);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not repair user role";
        return jsonResponse({ error: message }, 500);
      }

      if (context.source === "invitation" && context.invitationStatus === "pending" && context.invitationId) {
        await serviceClient
          .from("company_invitations")
          .update({ status: "accepted", accepted_at: new Date().toISOString() })
          .eq("id", context.invitationId)
          .eq("status", "pending");
      }

      return jsonResponse({
        repaired: true,
        source: context.source,
        company: { id: context.company.id, name: context.company.name },
        membership: { role: context.role },
      });
    }

    const adminContext = await requireAdminContext(req, supabaseUrl, anonKey, serviceRoleKey);
    if (adminContext.error) {
      return adminContext.error;
    }

    const { supabase, company, user } = adminContext;

    if (action === "invite-user") {
      const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
      const role = typeof body?.role === "string" ? body.role : "user";

      if (!email || !isValidEmail(email)) {
        return jsonResponse({ error: "A valid email is required" }, 400);
      }

      if (!ALLOWED_ROLES.has(role)) {
        return jsonResponse({ error: "Invalid role requested" }, 400);
      }

      const { count, error: countError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id);

      if (countError) {
        return jsonResponse({ error: "Could not validate user capacity" }, 500);
      }

      if ((count ?? 0) >= company.max_users) {
        return jsonResponse({ error: "Company user limit reached", max_users: company.max_users }, 409);
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("company_id", company.id)
        .ilike("email", email)
        .maybeSingle();

      if (existingProfileError) {
        return jsonResponse({ error: "Could not validate existing users" }, 500);
      }

      if (existingProfile) {
        return jsonResponse({ error: "A user with this email already belongs to the company" }, 409);
      }

      await supabase
        .from("company_invitations")
        .update({ status: "expired" })
        .eq("company_id", company.id)
        .eq("status", "pending")
        .lt("expires_at", new Date().toISOString());

      const { data: existingInvite, error: existingInviteError } = await supabase
        .from("company_invitations")
        .select("id, email, role, status, token, expires_at, created_at")
        .eq("company_id", company.id)
        .ilike("email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (existingInviteError) {
        return jsonResponse({ error: "Could not validate existing invitations" }, 500);
      }

      if (existingInvite) {
        const emailDelivery = await sendInvitationEmail({
          req,
          to: email,
          role: existingInvite.role,
          companyName: company.name,
          inviterEmail: normalizeEmail(user.email ?? "") || "un administrador",
          token: existingInvite.token,
        });

        return jsonResponse({
          invitation: existingInvite,
          token: existingInvite.token,
          already_pending: true,
          email_delivery: emailDelivery,
          company: { id: company.id, name: company.name },
        });
      }

      const token = generateInvitationToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: invitation, error: insertError } = await supabase
        .from("company_invitations")
        .insert({
          company_id: company.id,
          email,
          role,
          invited_by: user.id,
          token,
          expires_at: expiresAt,
        })
        .select("id, email, role, status, token, expires_at, created_at")
        .single();

      if (insertError) {
        return jsonResponse({ error: insertError.message }, 500);
      }

      const emailDelivery = await sendInvitationEmail({
        req,
        to: email,
        role,
        companyName: company.name,
        inviterEmail: normalizeEmail(user.email ?? "") || "un administrador",
        token: invitation.token,
      });

      return jsonResponse({
        invitation,
        token: invitation.token,
        email_delivery: emailDelivery,
        company: { id: company.id, name: company.name },
      });
    }

    if (action === "list-invitations") {
      const { data, error } = await supabase
        .from("company_invitations")
        .select("id, email, role, status, expires_at, accepted_at, created_at")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ invitations: data ?? [] });
    }

    if (action === "revoke-invitation") {
      const invitationId = typeof body?.invitation_id === "string" ? body.invitation_id : "";
      if (!invitationId) {
        return jsonResponse({ error: "invitation_id is required" }, 400);
      }

      const { data, error } = await supabase
        .from("company_invitations")
        .update({ status: "revoked" })
        .eq("id", invitationId)
        .eq("company_id", company.id)
        .eq("status", "pending")
        .select("id, email, role, status, expires_at, updated_at")
        .maybeSingle();

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      if (!data) {
        return jsonResponse({ error: "Pending invitation not found" }, 404);
      }

      return jsonResponse({ invitation: data });
    }

    return jsonResponse({ error: "Unsupported action" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});