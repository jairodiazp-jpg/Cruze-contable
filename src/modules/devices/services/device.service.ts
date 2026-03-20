import { supabase } from '@/integrations/supabase/client';
import type { Device } from '../types/device.types';

export async function getDeviceBySerial(serial_number: string): Promise<Device | null> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('serial_number', serial_number)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Device | null;
}

export async function listDevicesByCompany(company_id: string): Promise<Device[]> {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .eq('company_id', company_id);
  if (error) throw new Error(error.message);
  return data as Device[];
}
