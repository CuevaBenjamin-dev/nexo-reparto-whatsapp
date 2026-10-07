'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, RefreshCw, LockKeyhole, UserRoundPen } from 'lucide-react';
import { api, json, Asesor, Conversacion, Mensaje, Usuario } from '@/lib/api';

function contenido(m: Mensaje) {
  if (m.tipo !== 'INTERACTIVO') return m.contenido;
  try { const opciones = JSON.parse(m.contenido) as Array<{ titulo: string }>; return `Menú: ${opciones.map(o => o.titulo).join(' · ')}`; }
  catch { return m.contenido; }
}
const hora = (fecha: string) => new Date(fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

export function Inbox({ usuario, version, abrirId, onChange }: { usuario: Usuario; version: number; abrirId?: number; onChange: () => void }) {
  const [lista, setLista] = useState<Conversacion[]>([]);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Conversacion>();
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [texto, setTexto] = useState('');
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filtroCanal, setFiltroCanal] = useState('');
  const [filtroAsesor, setFiltroAsesor] = useState('');
  const [canalesFiltro, setCanalesFiltro] = useState<Array<{ id: number; nombre: string; numeroVisible?: string | null }>>([]);
  const historialRef = useRef<HTMLDivElement>(null);
  const supervisor = usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR';
  const recargar = useCallback(async () => {
    try {
      const params = new URLSearchParams(); if (filtroCanal) params.set('canalId', filtroCanal); if (filtroAsesor) params.set('asesorId', filtroAsesor);
      const conversaciones = await api<Conversacion[]>(`/conversaciones?${params}`); setLista(conversaciones);
      if (seleccion) setDetalle(await api<Conversacion>(`/conversaciones/${seleccion}`));
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); }
  }, [seleccion, filtroCanal, filtroAsesor]);
  useEffect(() => { void recargar(); }, [recargar, version]);
  useEffect(() => { if (abrirId) { setSeleccion(abrirId); void api<Conversacion>(`/conversaciones/${abrirId}`).then(setDetalle).catch(() => setError('No se pudo abrir la conversación')); } }, [abrirId]);
  useEffect(() => { if (historialRef.current) historialRef.current.scrollTop = historialRef.current.scrollHeight; }, [detalle?.id, detalle?.mensajes.length]);
  useEffect(() => { if (supervisor) api<Asesor[]>('/asesores').then(setAsesores).catch(() => {}); }, [supervisor]);
  useEffect(() => { if (supervisor) api<Array<{ id: number; nombre: string; numeroVisible?: string | null }>>('/canales-whatsapp/visibles').then(setCanalesFiltro).catch(() => {}); }, [supervisor]);
  async function abrir(id: number) { setSeleccion(id); setError(''); try { setDetalle(await api<Conversacion>(`/conversaciones/${id}`)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir'); } }
  async function responder(e: FormEvent) {
    e.preventDefault(); if (!seleccion || !texto.trim()) return; setBusy(true); setError('');
    try { await api(`/conversaciones/${seleccion}/mensajes`, json('POST', { contenido: texto })); setTexto(''); await recargar(); onChange(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar'); } finally { setBusy(false); }
  }
  async function accion(ruta: string, cuerpo?: unknown) {
    if (!seleccion) return; setBusy(true); setError('');
    try { await api(`/conversaciones/${seleccion}/${ruta}`, json('POST', cuerpo)); await recargar(); onChange(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar'); } finally { setBusy(false); }
  }
  const visibles = lista;
  return <div className="h-[calc(100vh-64px)] md:h-screen flex flex-col p-3 md:p-6 gap-3 md:gap-4 max-w-[1600px] mx-auto">
    <div className="hidden md:flex items-center justify-between"><div><div className="eyebrow mb-1">Centro de atención</div><h1 className="text-2xl font-bold">Conversaciones</h1></div><button className="button button-light" onClick={() => void recargar()}><RefreshCw size={16}/> Actualizar</button></div>
    {error && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>}
    {supervisor && <div className="flex gap-2"><select aria-label="Filtrar canal" className="field max-w-[230px]" value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)}><option value="">Todos los canales</option>{canalesFiltro.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.numeroVisible}</option>)}</select><select aria-label="Filtrar asesor" className="field max-w-[220px]" value={filtroAsesor} onChange={e => setFiltroAsesor(e.target.value)}><option value="">Todos los asesores</option>{asesores.map(a => <option key={a.id} value={a.id}>{a.usuario.nombre} {a.usuario.apellido}</option>)}</select></div>}
    <div className="card flex flex-1 overflow-hidden min-h-0">
      <aside className={`${seleccion ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[330px] lg:w-[370px] border-r border-slate-200 min-h-0`}>
        <div className="p-5 border-b border-slate-200"><h2 className="font-bold">Bandeja <span className="text-sm font-normal muted">({visibles.length})</span></h2><p className="text-xs muted mt-1">Chats por número y asesor</p></div>
        <div className="overflow-y-auto scroll-thin flex-1">{visibles.length ? visibles.map(c => <button key={c.id} onClick={() => void abrir(c.id)} className={`text-left w-full px-4 py-4 border-b border-slate-100 hover:bg-blue-50 ${seleccion === c.id ? 'bg-blue-50' : ''}`}>
          <div className="flex justify-between gap-3"><span className="font-semibold truncate">{c.contacto.nombre || c.contacto.telefono}</span><span className="text-xs muted whitespace-nowrap">{hora(c.fechaUltimoMensaje)}</span></div>
          <div className="text-xs muted mt-1">{c.contacto.telefono} · {c.canal ? `${c.canal.nombre} (${c.canal.numeroVisible || 'sin número'})` : c.grupo?.nombre || 'Legado'}</div>
          <div className="flex justify-between gap-2 items-center mt-2"><span className="text-sm text-slate-500 truncate">{c.mensajes[0] ? contenido(c.mensajes[0]) : 'Sin mensajes'}</span><span className={`badge whitespace-nowrap ${c.estado === 'PENDIENTE_ASIGNACION' ? 'bg-amber-50 text-amber-700' : c.estado === 'CERRADA' ? 'badge-off' : ''}`}>{c.estado.replaceAll('_', ' ').toLowerCase()}</span></div>
        </button>) : <div className="p-7 text-center muted text-sm">No hay conversaciones visibles.</div>}</div>
      </aside>
      <section className={`${seleccion ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 min-h-0`}>
        {!detalle ? <div className="m-auto text-center p-6"><div className="text-5xl mb-4">✉</div><h2 className="text-lg font-bold">Selecciona una conversación</h2><p className="muted text-sm mt-2">Aquí verás los mensajes y las acciones disponibles.</p></div> : <>
          <div className="px-4 md:px-6 py-4 border-b border-slate-200 flex items-center gap-3"><button aria-label="Volver a la lista" className="md:hidden button button-light !p-2" onClick={() => { setSeleccion(null); setDetalle(undefined); }}><ArrowLeft size={18}/></button><div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">{(detalle.contacto.nombre || detalle.contacto.telefono)[0]}</div><div className="min-w-0"><h2 className="font-bold truncate">{detalle.contacto.nombre || detalle.contacto.telefono}</h2><p className="text-xs muted">{detalle.contacto.telefono} · {detalle.canal ? `${detalle.canal.nombre} · ${detalle.canal.numeroVisible || ''}` : detalle.grupo?.nombre || 'Legado'}</p></div><span className="ml-auto badge">{detalle.estado.replaceAll('_', ' ')}</span></div>
          <div ref={historialRef} className="flex-1 overflow-y-auto scroll-thin p-4 md:p-6 space-y-3 bg-[#f8fafc]">{detalle.mensajes.map(m => <div key={m.id} className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm text-sm ${m.direccion === 'SALIENTE' ? 'ml-auto bg-blue-600 text-white rounded-br-sm' : 'mr-auto bg-white border border-slate-200 rounded-bl-sm'}`}><div className="whitespace-pre-wrap break-words">{contenido(m)}</div><div className={`text-[11px] mt-1 text-right ${m.direccion === 'SALIENTE' ? 'text-blue-100' : 'text-slate-400'}`}>{m.origen === 'WHATSAPP_BUSINESS_APP' ? 'WhatsApp Business App · ' : m.origen === 'NEXO' ? 'NEXO · ' : ''}{hora(m.fechaCreacion)} {m.estadoEnvio ? `· ${m.estadoEnvio.toLowerCase()}` : ''}</div></div>)}</div>
          {supervisor && !detalle.canal && <div className="px-4 md:px-6 py-3 border-t border-slate-200 bg-white flex flex-wrap gap-2 items-center"><select aria-label="Asesor de destino" className="field max-w-[200px] !py-2" value={destino} onChange={e => setDestino(e.target.value)}><option value="">Selecciona asesor</option>{asesores.filter(a => a.grupoId === detalle.grupo?.id && a.activoReparto && a.usuario.activo).map(a => <option key={a.id} value={a.id}>{a.usuario.nombre} {a.usuario.apellido}</option>)}</select><input aria-label="Motivo de reasignación" className="field max-w-[200px] !py-2" placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)}/><button className="button button-light" disabled={busy || !destino} onClick={() => void accion('reasignar', { asesorId: Number(destino), motivo })}><UserRoundPen size={15}/> Reasignar</button>{detalle.estado === 'PENDIENTE_ASIGNACION' && <button className="button button-primary" disabled={busy} onClick={() => void accion('repartir')}>Ejecutar reparto</button>}</div>}
          {detalle.estado !== 'CERRADA' && <div className="px-4 md:px-6 py-3 border-t border-slate-200 flex justify-end"><button className="button button-light text-sm" disabled={busy} onClick={() => { if (window.confirm('¿Cerrar esta conversación?')) void accion('cerrar'); }}><LockKeyhole size={15}/> Cerrar conversación</button></div>}
          {usuario.rol === 'ASESOR' && detalle.canal?.tipo === 'ASESOR' && detalle.estado === 'ABIERTA' && <div className="px-4 md:px-6 py-2 text-xs muted flex items-center justify-between gap-3"><span>Si terminó la ventana de atención de 24 horas, usa una plantilla aprobada.</span><button className="button button-light text-sm" disabled={busy} onClick={() => void accion('plantilla')}>Enviar plantilla</button></div>}
          {usuario.rol === 'ASESOR' && detalle.estado === 'ABIERTA' && <form onSubmit={responder} className="px-4 md:px-6 py-4 border-t border-slate-200 flex gap-3"><input className="field" aria-label="Escribir mensaje" placeholder="Escribe una respuesta…" value={texto} onChange={e => setTexto(e.target.value)} maxLength={4096}/><button className="button button-primary" disabled={busy || !texto.trim()} aria-label="Enviar mensaje"><Send size={18}/></button></form>}
        </>}
      </section>
    </div>
  </div>;
}
