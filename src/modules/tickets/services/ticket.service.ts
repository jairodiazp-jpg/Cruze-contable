import { supabase } from '@/integrations/supabase/client';

import type { Ticket, TicketStatus } from '../types/ticket.types';


// Los campos mínimos requeridos para crear un ticket

import type { Database } from '@/integrations/supabase/types';
type TicketCategory = Database['public']['Enums']['ticket_category'];
type TicketPriority = Database['public']['Enums']['ticket_priority'];

type CreateTicketInput = {
  requester: string;
  requester_email: string;
  subject: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  company_id?: string;
  created_by?: string;
};

export async function createTicket(data: CreateTicketInput): Promise<Ticket> {
  // Idempotencia: evitar duplicados por requester, subject, company_id, status='abierto'
  const { data: existing } = await supabase
    .from('tickets')
    .select('*')
    .eq('requester', data.requester)
    .eq('subject', data.subject)
    .eq('company_id', data.company_id ?? null)
    .eq('status', 'abierto')
    .maybeSingle();
  if (existing) return existing as Ticket;

  const code = 'CASE-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  const insertData: Database['public']['Tables']['tickets']['Insert'] = {
    code,
    requester: data.requester,
    requester_email: data.requester_email,
    subject: data.subject,
    description: data.description ?? null,
    category: data.category ?? 'otro',
    priority: data.priority ?? 'media',
    company_id: data.company_id ?? null,
    created_by: data.created_by ?? null,
    status: 'abierto',
  };
  const { data: created, error } = await supabase
    .from('tickets')
    .insert(insertData)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return created as Ticket;
}


export async function listTicketsByCompany(company_id: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('company_id', company_id);
  if (error) throw new Error(error.message);
  return (data ?? []) as Ticket[];
}
