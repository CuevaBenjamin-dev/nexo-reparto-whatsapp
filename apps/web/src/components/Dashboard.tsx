'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MessagesSquare, Clock3, UserRoundCheck, UserRoundX, ClipboardList } from 'lucide-react';

interface Datos { abiertas: number; pendientesLegado: number; activos: number; inactivos: number; asignacionesHoy: number; solicitudesPendientes: number; solicitudesHoy: number; }
export function Dashboard({ version, ir }: { version: number; ir: (vista: string) => void }) {
  const [datos, setDatos] = useState<Datos>(); const [error, setError] = useState('');
  useEffect(() => { api<Datos>('/dashboard').then(setDatos).catch(e => setError(e.message)); }, [version]);
  const tarjetas = [
    { titulo: 'Conversaciones abiertas', valor: datos?.abiertas, icono: MessagesSquare, color: 'text-blue-700 bg-blue-50' },
    { titulo: 'Solicitudes sin asignar', valor: datos?.solicitudesPendientes, icono: Clock3, color: 'text-amber-700 bg-amber-50' },
    { titulo: 'Asesores disponibles', valor: datos?.activos, icono: UserRoundCheck, color: 'text-emerald-700 bg-emerald-50' },
    { titulo: 'Asesores inactivos', valor: datos?.inactivos, icono: UserRoundX, color: 'text-rose-700 bg-rose-50' },
    { titulo: 'Asignaciones hoy', valor: datos?.asignacionesHoy, icono: ClipboardList, color: 'text-violet-700 bg-violet-50' },
    { titulo: 'Solicitudes recibidas hoy', valor: datos?.solicitudesHoy, icono: ClipboardList, color: 'text-cyan-700 bg-cyan-50' },
  ];
  return <div className="p-5 md:p-8 max-w-7xl mx-auto"><div className="mb-8"><div className="eyebrow mb-2">Resumen operativo</div><h1 className="text-3xl font-bold">Inicio</h1><p className="muted mt-2">Estado de la atención en este momento.</p></div>
    {error && <p role="alert" className="text-red-700 mb-4">{error}</p>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{tarjetas.map(t => <div key={t.titulo} className="card p-5"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${t.color}`}><t.icono size={20}/></div><div className="text-3xl font-bold">{t.valor ?? '—'}</div><div className="text-sm muted mt-2">{t.titulo}</div></div>)}</div>
    <div className="card p-6 mt-6 flex flex-wrap gap-4 items-center justify-between"><div><h2 className="font-bold text-lg">Atención en curso</h2><p className="muted text-sm mt-1">Revisa las consultas asignadas o pendientes.</p></div><button className="button button-primary" onClick={() => ir('asignaciones')}>Abrir asignaciones</button></div>
  </div>;
}
