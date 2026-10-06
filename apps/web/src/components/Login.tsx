'use client';
import { FormEvent, useState } from 'react';
import { ArrowRight, MessageCircleMore } from 'lucide-react';
import { api, json, Usuario } from '@/lib/api';

export function Login({ onLogin }: { onLogin: (u: Usuario) => void }) {
  const [correo, setCorreo] = useState('admin@local.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function entrar(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try { onLogin(await api<Usuario>('/auth/login', json('POST', { correo, password }))); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión'); }
    finally { setLoading(false); }
  }
  return <main className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(circle_at_top_left,#e4edff,#f5f8fb_55%)]">
    <div className="card w-full max-w-md p-8 md:p-10">
      <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-8"><MessageCircleMore size={25}/></div>
      <div className="eyebrow mb-2">Nexo / Atención comercial</div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Bienvenido</h1>
      <p className="muted mb-8">Ingresa para gestionar conversaciones y asesores.</p>
      <form onSubmit={entrar} className="space-y-5">
        <label className="block"><span className="text-sm font-semibold block mb-2">Correo</span><input className="field" type="email" value={correo} onChange={e => setCorreo(e.target.value)} required autoComplete="username"/></label>
        <label className="block"><span className="text-sm font-semibold block mb-2">Contraseña</span><input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/></label>
        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
        <button className="button button-primary w-full" disabled={loading}>{loading ? 'Ingresando…' : <>Entrar <ArrowRight size={17}/></>}</button>
      </form>
    </div>
  </main>;
}
