import { supabase } from "@/integrations/supabase/client";
import { applyCompanyScope } from "./companyScope";

/** Minimum fields for a device picker / dropdown. */
export interface DevicePickerRow {
  id: string;
  device_id: string;
  hostname: string;
}

/** Extended picker row that includes the assigned user. */
export interface DevicePickerRowWithUser extends DevicePickerRow {
  user_assigned: string | null;
}

/** Extended picker row that includes the device role type. */
export interface DevicePickerRowWithRole extends DevicePickerRow {
  role_type: string | null;
}

/**
 * Fetches a compact device list for pickers/dropdowns, ordered by hostname
 * and scoped to the given company.
 *
 * @param companyId - Company UUID used for RLS-safe filtering.
 * @param fields    - Comma-separated select string. Defaults to "id, device_id, hostname".
 */
export async function fetchDeviceList<T extends DevicePickerRow = DevicePickerRow>(
  companyId: string | null | undefined,
  fields = "id, device_id, hostname",
): Promise<T[]> {
  const base: any = supabase.from("devices").select(fields);
  const { data } = await applyCompanyScope(base, companyId).order("hostname");
  return (data ?? []) as T[];
}
