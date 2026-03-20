export type DeviceStatus = 'active' | 'inactive' | 'provisioning' | 'retired';

export interface Device {
  id: string;
  serial_number: string;
  user_id: string;
  company_id: string;
  type: string;
  status: DeviceStatus;
  created_at: string;
}
