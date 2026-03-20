import React, { useState, useEffect } from 'react';
import { useTickets } from '../hooks/useTickets';
import type { Ticket, TicketStatus } from '../types/ticket.types';
import { updateTicketStatus } from '../services/ticket.actions';

interface AdminTicketsDashboardProps {
  company_id: string;
}

export const AdminTicketsDashboard: React.FC<AdminTicketsDashboardProps> = ({ company_id }) => {
  const { tickets, loading, error } = useTickets(company_id);

  // Filtros alineados con enums reales
  const [filter, setFilter] = useState<'all' | 'abierto' | 'en_proceso' | 'resuelto'>('all');
  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  const [updating, setUpdating] = useState<string | null>(null);

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    setUpdating(ticketId + status);
    try {
      await updateTicketStatus(ticketId, status);
      // No recargar, esperar realtime
    } catch (e) {
      alert('Error al actualizar el estado: ' + (e as any).message);
    } finally {
      setUpdating(null);
    }
  };

  // Suscripción realtime a tickets
  useEffect(() => {
    // @ts-ignore
    const channel = window.supabase?.channel?.('tickets-dashboard') || (typeof supabase !== 'undefined' && supabase.channel && supabase.channel('tickets-dashboard'));
    if (!channel || !company_id) return;
    const subscription = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `company_id=eq.${company_id}` }, (payload: any) => {
        // Forzar recarga de tickets (ideal: actualizar estado local)
        window.location.reload();
      })
      .subscribe();
    return () => { channel.unsubscribe && channel.unsubscribe(); };
  }, [company_id]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4">Tickets de soporte</h2>
      <div className="flex gap-2 mb-4">
        <button className={`px-3 py-1 rounded ${filter==='all'?'bg-primary text-white':'bg-neutral-100'}`} onClick={()=>setFilter('all')}>Todos</button>
        <button className={`px-3 py-1 rounded ${filter==='abierto'?'bg-yellow-500 text-white':'bg-neutral-100'}`} onClick={()=>setFilter('abierto')}>Abiertos</button>
        <button className={`px-3 py-1 rounded ${filter==='en_proceso'?'bg-blue-500 text-white':'bg-neutral-100'}`} onClick={()=>setFilter('en_proceso')}>En proceso</button>
        <button className={`px-3 py-1 rounded ${filter==='resuelto'?'bg-green-600 text-white':'bg-neutral-100'}`} onClick={()=>setFilter('resuelto')}>Resueltos</button>
      </div>
      {loading && <div>Cargando tickets...</div>}
      {error && <div className="text-red-500">Error: {error}</div>}
      <table className="w-full border text-sm bg-white">
        <thead>
          <tr className="bg-neutral-50">
            <th className="p-2 border">Caso</th>
            <th className="p-2 border">Usuario</th>
            <th className="p-2 border">Equipo</th>
            <th className="p-2 border">Mensaje</th>
            <th className="p-2 border">Estado</th>
            <th className="p-2 border">Fecha</th>
            <th className="p-2 border">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t: Ticket) => (
            <tr key={t.id} className="border-b hover:bg-neutral-50">
              <td className="p-2 border font-mono">{t.code}</td>
              <td className="p-2 border">{t.requester}</td>
              <td className="p-2 border">{t.assigned_tech ?? '-'}</td>
              <td className="p-2 border">{t.subject}</td>
              <td className="p-2 border">{t.status}</td>
              <td className="p-2 border">{new Date(t.created_at).toLocaleString()}</td>
              <td className="p-2 border">
                {t.status !== 'en_proceso' && t.status !== 'resuelto' && (
                  <button
                    className="px-2 py-1 bg-blue-500 text-white rounded mr-1 text-xs"
                    disabled={!!updating}
                    onClick={() => handleStatusChange(t.id, 'en_proceso')}
                  >En proceso</button>
                )}
                {t.status !== 'resuelto' && (
                  <button
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                    disabled={!!updating}
                    onClick={() => handleStatusChange(t.id, 'resuelto')}
                  >Resuelto</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && !loading && <div className="text-neutral-400 mt-4">No hay tickets para mostrar.</div>}
    </div>
  );
};

export default AdminTicketsDashboard;
