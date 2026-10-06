import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { firmaValida } from '../src/webhook';
import { leerConfiguracion } from '../src/config';

describe('seguridad de webhook y configuración', () => {
  it('acepta solo la firma HMAC del cuerpo RAW', () => {
    const raw = Buffer.from('{"hola":"mundo"}');
    const firma = `sha256=${createHmac('sha256', 'secreto').update(raw).digest('hex')}`;
    expect(firmaValida(raw, firma, 'secreto')).toBe(true);
    expect(firmaValida(Buffer.from('{ "hola":"mundo" }'), firma, 'secreto')).toBe(false);
    expect(firmaValida(raw, 'sha256=0000', 'secreto')).toBe(false);
  });
  it('mock no exige Meta y meta señala la credencial faltante', () => {
    const base = { DATABASE_URL: 'postgresql://local', REDIS_URL: 'redis://local', AUTH_SECRET: 'abc', COOKIE_SECRET: 'def', WHATSAPP_MODE: 'mock' };
    expect(leerConfiguracion(base).whatsappMode).toBe('mock');
    expect(() => leerConfiguracion({ ...base, WHATSAPP_MODE: 'meta' })).toThrow('META_GRAPH_API_VERSION');
  });
});
