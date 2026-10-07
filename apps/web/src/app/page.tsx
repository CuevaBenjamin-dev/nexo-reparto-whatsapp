'use client';
import { useEffect, useState } from 'react';
import { LayoutDashboard, MessagesSquare, UsersRound, FolderKanban, ListChecks, UserCog, Settings2, ScrollText, Smartphone, LogOut, Menu, X, MessageCircleMore, ClipboardList } from 'lucide-react';
import { api, API_URL, Usuario } from '@/lib/api';
import { Login } from '@/components/Login';
import { Dashboard } from '@/components/Dashboard';
import { Inbox } from '@/components/Inbox';
import { Simulator } from '@/components/Simulator';
import { Management } from '@/components/Management';
import { Assignments } from '@/components/Assignments';
import { Channels } from '@/components/Channels';

type Vista = 'inicio' | 'asignaciones' | 'conversaciones' | 'canales' | 'asesores' | 'grupos' | 'opciones' | 'usuarios' | 'configuracion' | 'auditoria' | 'simulador';
const navegacion = [
  { id: 'inicio', nombre: 'Inicio', icono: LayoutDashboard, roles: ['ADMIN', 'SUPERVISOR'] },
  { id: 'asignaciones', nombre: 'Asignaciones', icono: ClipboardList, roles: ['ADMIN', 'SUPERVISOR', 'ASESOR'] },
  { id: 'conversaciones', nombre: 'Conversaciones', icono: MessagesSquare, roles: ['ADMIN', 'SUPERVISOR', 'ASESOR'] },
  { id: 'canales', nombre: 'Canales WhatsApp', icono: Smartphone, roles: ['ADMIN', 'SUPERVISOR'] },
  { id: 'asesores', nombre: 'Asesores', icono: UsersRound, roles: ['ADMIN', 'SUPERVISOR', 'RRHH'] },
  { id: 'grupos', nombre: 'Grupos', icono: FolderKanban, roles: ['ADMIN', 'SUPERVISOR', 'RRHH'] },
  { id: 'opciones', nombre: 'Menú legado V1', icono: ListChecks, roles: ['ADMIN', 'SUPERVISOR'] },
  { id: 'usuarios', nombre: 'Usuarios', icono: UserCog, roles: ['ADMIN'] },
  { id: 'configuracion', nombre: 'Configuración', icono: Settings2, roles: ['ADMIN'] },
  { id: 'auditoria', nombre: 'Auditoría', icono: ScrollText, roles: ['ADMIN', 'SUPERVISOR'] },
  { id: 'simulador', nombre: 'Simulador', icono: Smartphone, roles: ['ADMIN', 'SUPERVISOR'] },
] as const;

export default function Home() {
  const [usuario, setUsuario] = useState<Usuario | null>(); const [vista, setVista] = useState<Vista>('inicio'); const [version, setVersion] = useState(0); const [menu, setMenu] = useState(false); const [simuladorDisponible, setSimuladorDisponible] = useState(false); const [abrirId, setAbrirId] = useState<number>(); const [pendientes, setPendientes] = useState(0);
  useEffect(() => { api<Usuario>('/auth/me').then(u => { setUsuario(u); setVista(u.rol === 'ASESOR' ? 'asignaciones' : u.rol === 'RRHH' ? 'asesores' : 'inicio'); }).catch(() => setUsuario(null)); }, []);
  useEffect(() => {
    if (!usuario || usuario.rol === 'RRHH') return;
    const eventos = new EventSource(`${API_URL}/tiempo-real/eventos`, { withCredentials: true });
    for (const tipo of ['mensaje:nuevo', 'mensaje:estado', 'conversacion:actualizada', 'conversacion:asignada', 'conversacion:reasignada', 'solicitud:asignada', 'solicitud:reasignada']) eventos.addEventListener(tipo, () => setVersion(v => v + 1));
    return () => eventos.close();
  }, [usuario]);
  useEffect(() => { if (usuario) api<{ simuladorDisponible: boolean }>('/configuracion/estado').then(d => setSimuladorDisponible(d.simuladorDisponible)).catch(() => setSimuladorDisponible(false)); }, [usuario]);
  useEffect(() => { if (usuario && ['ASESOR', 'ADMIN', 'SUPERVISOR'].includes(usuario.rol)) api<Array<{ estado: string }>>('/solicitudes-reparto?estado=ASIGNADA').then(s => setPendientes(s.length)).catch(() => {}); }, [usuario, version]);
  async function salir() { try { await api('/auth/logout', { method: 'POST' }); } finally { setUsuario(null); } }
  if (usuario === undefined) return <div className="min-h-screen flex items-center justify-center muted">Cargando…</div>;
  if (!usuario) return <Login onLogin={u => { setUsuario(u); setVista(u.rol === 'ASESOR' ? 'asignaciones' : u.rol === 'RRHH' ? 'asesores' : 'inicio'); }}/ >;
  const visibles = navegacion.filter(n => n.roles.some(r => r === usuario.rol) && (n.id !== 'simulador' || simuladorDisponible));
  const cambiar = (v: Vista) => { setVista(v); setMenu(false); };
  return <div className="min-h-screen md:flex">
    <header className="md:hidden h-16 bg-[#13243c] text-white flex items-center justify-between px-4"><div className="flex items-center gap-2 font-bold"><MessageCircleMore size={22}/> Nexo</div><button aria-label={menu ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></header>
    <aside className={`${menu ? 'block' : 'hidden'} md:flex md:sticky md:top-0 md:h-screen w-full md:w-[250px] bg-[#13243c] text-slate-300 flex-col z-20`}>
      <div className="hidden md:flex h-20 px-6 items-center gap-3 text-white"><div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center"><MessageCircleMore size={20}/></div><div><div className="font-bold tracking-tight">Nexo</div><div className="text-[11px] text-slate-400">ATENCIÓN COMERCIAL</div></div></div>
      <nav aria-label="Navegación principal" className="flex-1 px-3 py-4 md:py-2 space-y-1">{visibles.map(n => <button key={n.id} onClick={() => cambiar(n.id as Vista)} className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${vista === n.id ? 'bg-blue-600 text-white' : 'hover:bg-[#223753] hover:text-white'}`}><n.icono size={18}/>{n.nombre}{n.id === 'asignaciones' && pendientes > 0 && <span className="ml-auto rounded-full bg-amber-400 text-slate-900 px-2 text-xs">{pendientes}</span>}</button>)}</nav>
      <div className="p-4 border-t border-slate-700"><div className="text-sm font-semibold text-white truncate">{usuario.nombre} {usuario.apellido}</div><div className="text-xs text-slate-400 mb-4">{usuario.rol}</div><button className="text-sm flex items-center gap-2 hover:text-white" onClick={() => void salir()}><LogOut size={16}/> Cerrar sesión</button></div>
    </aside>
    <main className="flex-1 min-w-0">{vista === 'inicio' && <Dashboard version={version} ir={v => cambiar(v as Vista)}/ >}{vista === 'asignaciones' && <Assignments usuario={usuario} version={version} onChange={() => setVersion(v => v + 1)} abrirConversacion={id => { setAbrirId(id); cambiar('conversaciones'); }}/ >}{vista === 'conversaciones' && <Inbox usuario={usuario} version={version} abrirId={abrirId} onChange={() => setVersion(v => v + 1)}/ >}{vista === 'canales' && <Channels usuario={usuario} version={version} onChange={() => setVersion(v => v + 1)}/ >}{vista === 'simulador' && <Simulator version={version}/ >}{(['asesores', 'grupos', 'opciones', 'usuarios', 'configuracion', 'auditoria'] as Vista[]).includes(vista) && <Management vista={vista as 'asesores' | 'grupos' | 'opciones' | 'usuarios' | 'configuracion' | 'auditoria'} usuario={usuario} version={version} onChange={() => setVersion(v => v + 1)}/>}</main>
  </div>;
}
