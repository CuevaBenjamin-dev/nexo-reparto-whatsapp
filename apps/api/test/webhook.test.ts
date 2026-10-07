import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import { firmaValida, WebhookController } from '../src/webhook';
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
  it('encamina messages y smb_message_echoes por Phone Number ID y conserva eventos desconocidos', async () => {
    const registrar = vi.fn().mockResolvedValue(undefined);
    const encolar = vi.fn().mockResolvedValue(undefined);
    const db = { canalWhatsapp: { findUnique: vi.fn().mockResolvedValue({ id: 2, tipo: 'ASESOR' }) } };
    const controller = new WebhookController({ whatsappMode: 'meta', metaAppSecret: 'secreto' } as never, db as never, { registrar } as never, { encolar } as never);
    const cuerpo = { object: 'whatsapp_business_account', entry: [{ changes: [
      { field: 'messages', value: { metadata: { phone_number_id: 'pn-2' }, messages: [{ id: 'wamid.in', from: '51912345678', type: 'text', text: { body: 'Hola' } }] } },
      { field: 'smb_message_echoes', value: { metadata: { phone_number_id: 'pn-2' }, messages: [{ id: 'wamid.echo', from: 'pn-2', to: '51912345678', type: 'text', text: { body: 'Desde el celular' } }] } },
      { field: 'nuevo_evento', value: { algo: 'desconocido' } },
    ] }] };
    const raw = Buffer.from(JSON.stringify(cuerpo));
    const firma = `sha256=${createHmac('sha256', 'secreto').update(raw).digest('hex')}`;
    await expect(controller.recibir({ rawBody: raw, header: () => firma } as never, cuerpo)).resolves.toEqual({ ok: true });
    expect(registrar.mock.calls.map(c => c[1])).toEqual(['mensaje_canal', 'eco_canal', 'desconocido']);
    expect(registrar.mock.calls[1][2]).toMatchObject({ destinatario: '51912345678', contenido: 'Desde el celular' });
    expect(encolar).toHaveBeenCalledTimes(3);
    await expect(controller.recibir({ rawBody: raw, header: () => 'sha256=0000' } as never, cuerpo)).rejects.toMatchObject({ status: 403 });
  });
});
