'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Send, Smartphone, RotateCcw } from 'lucide-react';
import { api, json, Conversacion, Mensaje } from '@/lib/api';

interface MenuOpcion { id: string; titulo: string; descripcion?: string; }
function opciones(m: Mensaje): MenuOpcion[] { try { return m.tipo === 'INTERACTIVO' ? JSON.parse(m.contenido) as MenuOpcion[] : []; } catch { return []; } }

export function Simulator({ version }: { version: number }) {
  const [telefono, setTelefono] = useState('51999900001');
  const [texto, setTexto] = useState('');
  const [historial, setHistorial] = useState<Conversacion[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mensajesRef = useRef<HTMLDivElement>(null);
  const recargar = useCallback(async () => { if (/^\d{7,15}$/.test(telefono)) try { setHistorial(await api<Conversacion[]>(`/simulador/${telefono}`)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); } }, [telefono]);
  useEffect(() => { void recargar(); }, [recargar, version]);
  useEffect(() => { if (mensajesRef.current) mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight; }, [historial]);
  async function enviar(tipo: 'TEXTO' | 'INTERACTIVO', contenido: string, opcionId?: string) {
    if (!/^\d{7,15}$/.test(telefono)) { setError('Escribe un número ficticio de 7 a 15 dígitos'); return; }
    setBusy(true); setError('');
    try { setHistorial(await api<Conversacion[]>('/simulador/entrada', json('POST', { telefono, tipo, contenido, opcionId }))); setTexto(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar'); }
    finally { setBusy(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); if (texto.trim()) void enviar('TEXTO', texto.trim()); }
  const conversacion = historial[0];
  return <div className="p-5 md:p-8 max-w-6xl mx-auto"><div className="mb-7"><div className="eyebrow mb-2">Entorno de desarrollo</div><h1 className="text-3xl font-bold">Simulador de WhatsApp</h1><p className="muted mt-2">Prueba el recorrido completo sin credenciales de Meta.</p></div>
    <div className="grid lg:grid-cols-[290px_1fr] gap-5"><div className="card p-5 h-fit"><label className="block text-sm font-semibold mb-2" htmlFor="telefono">Número ficticio del cliente</label><input id="telefono" className="field" inputMode="numeric" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="51999900001"/><p className="text-xs muted mt-2">Usa otro número para iniciar un nuevo contacto.</p><button className="button button-light w-full mt-4" onClick={() => void recargar()}><RotateCcw size={16}/> Actualizar conversación</button><div className="border-t border-slate-200 mt-5 pt-5"><div className="eyebrow mb-3">Asignación actual</div>{conversacion ? <><div className="font-bold">{conversacion.asesor?.usuario.nombre || 'Sin asesor todavía'}</div><div className="text-sm muted mt-1">{conversacion.grupo?.nombre || 'Esperando opción'}</div><div className="badge mt-3">{conversacion.estado.replaceAll('_', ' ')}</div></> : <p className="text-sm muted">Envía “Hola” para comenzar.</p>}</div></div>
      <div className="card overflow-hidden flex flex-col h-[min(640px,calc(100vh-220px))] min-h-[430px]"><div className="p-4 border-b border-slate-200 flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center"><Smartphone size={20}/></div><div><div className="font-bold">Número oficial · simulación</div><div className="text-xs muted">Cliente {telefono || '—'}</div></div></div>
        <div ref={mensajesRef} className="flex-1 overflow-y-auto scroll-thin p-5 bg-[#f7f9fc] space-y-3">{!conversacion && <div className="m-auto text-center muted text-sm pt-16">Escribe “Hola” para recibir el menú.</div>}{conversacion?.mensajes.map(m => <div key={m.id} className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-sm ${m.direccion === 'ENTRANTE' ? 'ml-auto bg-blue-600 text-white rounded-br-sm' : 'mr-auto bg-white border border-slate-200 rounded-bl-sm'}`}>{m.tipo === 'INTERACTIVO' && m.direccion === 'SALIENTE' ? <><div className="font-semibold mb-3">¿En qué podemos ayudarte?</div><div className="space-y-2">{opciones(m).map(o => <button key={o.id} disabled={busy || conversacion.estado !== 'ESPERANDO_OPCION'} onClick={() => void enviar('INTERACTIVO', o.titulo, o.id)} className="block w-full text-left px-3 py-2 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-50 disabled:opacity-50"><span className="font-semibold">{o.titulo}</span>{o.descripcion && <span className="block text-xs">{o.descripcion}</span>}</button>)}</div></> : <div className="whitespace-pre-wrap">{m.contenido}</div>}<div className={`text-[11px] mt-1 text-right ${m.direccion === 'ENTRANTE' ? 'text-blue-100' : 'text-slate-400'}`}>{new Date(m.fechaCreacion).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</div></div>)}</div>
        {error && <div role="alert" className="px-4 py-2 text-sm text-red-700 bg-red-50">{error}</div>}
        <form onSubmit={submit} className="p-4 flex gap-3 border-t border-slate-200"><input className="field" aria-label="Mensaje del cliente" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribe Hola o un mensaje…" maxLength={4096}/><button className="button button-primary" aria-label="Enviar" disabled={busy || !texto.trim()}><Send size={18}/></button></form>
      </div>
    </div>
  </div>;
}
