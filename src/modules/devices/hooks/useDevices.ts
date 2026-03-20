import { useState, useEffect } from 'react';
import { getDeviceBySerial, listDevicesByCompany } from '../services/device.service';
import type { Device } from '../types/device.types';

export function useDevices(company_id?: string) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!company_id) return;
    listDevicesByCompany(company_id)
      .then(setDevices)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [company_id]);

  return { devices, loading, error, getDeviceBySerial };
}
