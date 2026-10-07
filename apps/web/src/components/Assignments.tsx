'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, json, Asesor, Usuario } from '@/lib/api';

type Estado = 'NUEVA' | 'ASIGNADA' | 'CONTACTO_INICIADO' | 'EN_ATENCION' | 'CERRADA' | 'CANCELADA';
interface Solicitud { id: number; estado: Estado; fechaRecepcion: string; fechaAsignacion?: string | null; fechaPrimerContacto?: string | null; contacto: { nombre?: string | null; telefono: string }; asesor?: { id: number; usuario: { nombre: string; apellido: string } } | null; canalAsesor?: { nombre: string; numeroVisible?: string | null } | null; grupo?: { nombre: string } | null; contenidoInicial: string; }
interface CanalVisible { asesorId: number | null; proveedor: 'MOCK' | 'META'; activo: boolean; estadoIntegracion: string; numeroVisible: string | null; phoneNumberId: string | null; wabaId: string | null; }
const fecha = (valor?: string | null) => valor ? new Date(valor).toLocaleString('es-PE') : '—';
const duracion = (desde?: string | null, hasta?: string | null) => {
  if (!desde || !hasta) return '—';
  const minutos = Math.max(0, Math.floor((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000));
  return minutos < 1 ? '<1 min' : minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
};

export function Assignments({ usuario, version, onChange, abrirConversacion }: { usuario: Usuario; version: number; onChange: () => void; abrirConversacion: (id: number) => void }) {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [asesorFiltro, setAsesorFiltro] = useState(''); const [estado, setEstado] = useState(''); const [cliente, setCliente] = useState(''); const [desde, setDesde] = useState('');
  const [destinos, setDestinos] = useState<Record<number, string>>({}); const [motivos, setMotivos] = useState<Record<number, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState<number | null>(null);
  const [ahora, setAhora] = useState<string>();
  const [modo, setModo] = useState<'mock' | 'meta' | null>(null);
  const [canales, setCanales] = useState<CanalVisible[]>([]);
  const supervisor = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR';
  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (asesorFiltro) params.set('asesorId', asesorFiltro); if (estado) params.set('estado', estado); if (cliente) params.set('cliente', cliente); if (desde) params.set('desde', new Date(`${desde}T00:00:00`).toISOString());
    try { setSolicitudes(await api<Solicitud[]>(`/solicitudes-reparto?${params}`)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar solicitudes'); }
  }, [asesorFiltro, estado, cliente, desde]);
  useEffect(() => { void cargar(); }, [cargar, version]);
  useEffect(() => { if (supervisor) api<Asesor[]>('/asesores').then(setAsesores).catch(() => {}); }, [supervisor]);
  useEffect(() => { void Promise.all([api<{ modo: 'mock' | 'meta' }>('/configuracion/estado'), api<CanalVisible[]>('/canales-whatsapp/visibles')]).then(([estado, visibles]) => { setModo(estado.modo); setCanales(visibles); }).catch(() => setError('No se pudo verificar el canal de atención')); }, [version]);
  useEffect(() => { const actualizar = () => setAhora(new Date().toISOString()); actualizar(); const reloj = window.setInterval(actualizar, 60000); return () => window.clearInterval(reloj); }, []);
  async function accion(id: number, tipo: 'iniciar' | 'repartir' | 'reasignar') {
    setBusy(id); setError('');
    try {
      const dato = await api<{ conversacionId?: number }>(`/solicitudes-reparto/${id}/${tipo}`, json('POST', tipo === 'reasignar' ? { asesorId: Number(destinos[id]), motivo: motivos[id] || '' } : {}));
      await cargar(); onChange();
      if (tipo === 'iniciar' && dato.conversacionId) abrirConversacion(dato.conversacionId);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción'); }
    finally { setBusy(null); }
  }
  const pendientes = solicitudes.filter(s => s.estado === 'ASIGNADA').length;
  const canalDisponible = (s: Solicitud) => modo && canales.some(c => c.asesorId === s.asesor?.id && c.proveedor === (modo === 'meta' ? 'META' : 'MOCK') && c.activo && c.estadoIntegracion === 'ACTIVO' && Boolean(c.numeroVisible?.trim() && c.phoneNumberId?.trim()) && (modo === 'mock' || (/^\d+$/.test(c.phoneNumberId || '') && /^\d+$/.test(c.wabaId || ''))));
  return <div className="p-5 md:p-8 max-w-7xl mx-auto"><div className="eyebrow mb-2">Atención comercial</div><h1 className="text-3xl font-bold">Asignaciones <span className="badge align-middle">{pendientes} pendientes</span></h1><p className="muted mt-2">Consultas recibidas por el repartidor y asignadas a cada asesor.</p>
    {supervisor && <div className="card p-4 mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><select aria-label="Filtrar por asesor" className="field" value={asesorFiltro} onChange={e => setAsesorFiltro(e.target.value)}><option value="">Todos los asesores</option>{asesores.map(a => <option key={a.id} value={a.id}>{a.usuario.nombre} {a.usuario.apellido}</option>)}</select><select aria-label="Filtrar por estado" className="field" value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option>{(['NUEVA', 'ASIGNADA', 'CONTACTO_INICIADO', 'EN_ATENCION', 'CERRADA', 'CANCELADA'] as Estado[]).map(e => <option key={e} value={e}>{e.replaceAll('_', ' ')}</option>)}</select><input aria-label="Filtrar por cliente" className="field" placeholder="Cliente o teléfono" value={cliente} onChange={e => setCliente(e.target.value)}/><input aria-label="Desde" className="field" type="date" value={desde} onChange={e => setDesde(e.target.value)}/></div>}
    {error && <p role="alert" className="mt-4 p-3 rounded-lg bg-red-50 text-red-700">{error}</p>}
    <div className="grid gap-4 mt-5">{solicitudes.map(s => <article key={s.id} className="card p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">{s.contacto.nombre || s.contacto.telefono} <span className="text-sm font-normal muted">{s.contacto.telefono}</span></h2><p className="text-sm muted mt-1">{s.contenidoInicial}{s.grupo && ` · ${s.grupo.nombre}`}</p></div><span className={`badge h-fit ${s.estado === 'ASIGNADA' ? 'bg-amber-50 text-amber-800' : ''}`}>{s.estado.replaceAll('_', ' ')}</span></div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4 text-xs muted"><div>Recibido: {fecha(s.fechaRecepcion)}</div><div>Asignado: {fecha(s.fechaAsignacion)}<br/>Espera: {duracion(s.fechaRecepcion, s.fechaAsignacion)}</div><div>Primer contacto: {fecha(s.fechaPrimerContacto)}<br/>Desde recepción: {duracion(s.fechaRecepcion, s.fechaPrimerContacto)}</div><div>Asesor: {s.asesor ? `${s.asesor.usuario.nombre} ${s.asesor.usuario.apellido}` : 'Pendiente'} · {s.canalAsesor?.numeroVisible || 'Sin canal'}{s.estado === 'ASIGNADA' && ahora && <><br/>Asignada hace: {duracion(s.fechaAsignacion, ahora)}</>}</div></div>{s.estado === 'ASIGNADA' && modo && !canalDisponible(s) && <p className="text-sm text-amber-800 mt-3">{s.asesor?.usuario.nombre || 'El asesor'} no tiene un canal WhatsApp {modo === 'meta' ? 'Meta' : 'demo'} activo.</p>}<div className="flex flex-wrap gap-2 mt-4">{s.estado === 'ASIGNADA' && <button className="button button-primary" disabled={busy !== null || !canalDisponible(s)} onClick={() => void accion(s.id, 'iniciar')}>Iniciar atención</button>}{supervisor && s.estado === 'NUEVA' && <button className="button button-light" disabled={busy !== null} onClick={() => void accion(s.id, 'repartir')}>Repartir ahora</button>}{supervisor && !['CERRADA', 'CANCELADA'].includes(s.estado) && <><select aria-label={`Reasignar solicitud ${s.id}`} className="field max-w-[200px]" value={destinos[s.id] || ''} onChange={e => setDestinos({ ...destinos, [s.id]: e.target.value })}><option value="">Otro asesor</option>{asesores.filter(a => a.id !== s.asesor?.id && a.activoReparto && a.disponible && a.usuario.activo).map(a => <option key={a.id} value={a.id}>{a.usuario.nombre}</option>)}</select><input aria-label={`Motivo solicitud ${s.id}`} className="field max-w-[220px]" placeholder="Motivo de reasignación" value={motivos[s.id] || ''} onChange={e => setMotivos({ ...motivos, [s.id]: e.target.value })}/><button className="button button-light" disabled={busy !== null || !destinos[s.id] || (motivos[s.id] || '').length < 3} onClick={() => void accion(s.id, 'reasignar')}>Reasignar</button></>}</div></article>)}{solicitudes.length === 0 && <div className="card p-8 text-center muted">No hay solicitudes con estos filtros.</div>}</div>
  </div>;
}
