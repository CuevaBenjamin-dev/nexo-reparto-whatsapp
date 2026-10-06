export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export type Rol = 'ADMIN' | 'SUPERVISOR' | 'RRHH' | 'ASESOR';
export interface Usuario { id: number; nombre: string; apellido: string; correo: string; rol: Rol; asesorId?: number; }
export interface Grupo { id: number; nombre: string; descripcion?: string | null; activo: boolean; }
export interface Asesor { id: number; usuarioId: number; grupoId: number; activoReparto: boolean; contadorReparto: number; totalAsignaciones: number; usuario: { id: number; nombre: string; apellido: string; correo: string; activo: boolean }; grupo: Grupo; }
export interface Opcion { id: number; titulo: string; descripcion?: string | null; identificadorExterno: string; grupoId: number; orden: number; activo: boolean; grupo: Grupo; }
export interface Mensaje { id: number; direccion: 'ENTRANTE' | 'SALIENTE'; tipo: string; contenido: string; estadoEnvio?: string | null; fechaCreacion: string; }
export interface Conversacion { id: number; estado: string; contacto: { telefono: string; nombre?: string | null; waId: string }; grupo?: Grupo | null; asesor?: Asesor | null; mensajes: Mensaje[]; fechaUltimoMensaje: string; }

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(opciones.headers || {}) }, cache: 'no-store' });
  if (!respuesta.ok) {
    const dato = await respuesta.json().catch(() => ({})) as { message?: string | string[] };
    throw new Error(Array.isArray(dato.message) ? dato.message.join(', ') : dato.message || `Error HTTP ${respuesta.status}`);
  }
  return respuesta.json() as Promise<T>;
}

export function json(method: 'POST' | 'PATCH', cuerpo?: unknown): RequestInit { return { method, body: JSON.stringify(cuerpo || {}) }; }
