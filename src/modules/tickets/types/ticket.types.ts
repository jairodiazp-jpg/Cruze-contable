
export type TicketStatus = 'abierto' | 'en_proceso' | 'en_espera' | 'resuelto' | 'cerrado';

export interface Ticket {
  id: string;
  code: string;
  requester: string;
  requester_email: string;
  category: string;
  priority: string;
  subject: string;
  description: string | null;
  assigned_tech: string | null;
  status: TicketStatus;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
  company_id: string | null;
}
