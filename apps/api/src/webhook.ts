import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { TipoMensaje } from '@prisma/client';
import { Publico } from './auth';
import { Configuracion } from './config';
import { ServicioEntradas, EntradaCliente } from './entradas';
import { ColaWhatsapp } from './cola';
import { BaseDatos } from './base-datos';
import { EcoCanal, MensajeCanal } from './operacion-v2';

export function firmaValida(raw: Buffer, firma: string | undefined, secreto: string): boolean {
  if (!firma || !/^sha256=[a-f0-9]{64}$/.test(firma)) return false;
  const esperado = Buffer.from(createHmac('sha256', secreto).update(raw).digest('hex'), 'hex');
  const recibido = Buffer.from(firma.slice(7), 'hex');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

interface MetaMensaje {
  id?: string; from?: string; to?: string; timestamp?: string; type?: string;
  text?: { body?: string };
  interactive?: { type?: string; list_reply?: { id?: string; title?: string }; button_reply?: { id?: string; title?: string } };
  image?: { caption?: string }; document?: { filename?: string; caption?: string };
}
interface MetaEstado { id?: string; status?: string; timestamp?: string; recipient_id?: string; }
interface MetaValor {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaMensaje[];
  message_echoes?: MetaMensaje[];
  statuses?: MetaEstado[];
}
interface MetaWebhook {
  object?: string;
  entry?: Array<{ changes?: Array<{ field?: string; value?: MetaValor }> }>;
}

function tipoMensaje(tipo?: string): TipoMensaje {
  const tipos: Record<string, TipoMensaje> = { text: 'TEXTO', interactive: 'INTERACTIVO', image: 'IMAGEN', document: 'DOCUMENTO', audio: 'AUDIO', video: 'VIDEO', location: 'UBICACION' };
  return tipos[tipo || ''] || 'TEXTO';
}
function contenidoMensaje(mensaje: MetaMensaje): string {
  return mensaje.text?.body || mensaje.interactive?.list_reply?.title || mensaje.interactive?.button_reply?.title || mensaje.image?.caption || mensaje.document?.caption || mensaje.document?.filename || `[${mensaje.type || 'evento'}]`;
}
function fechaMeta(timestamp?: string): string | undefined {
  const segundos = Number(timestamp);
  return timestamp && Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000).toISOString() : undefined;
}

@Controller('webhooks/meta/whatsapp')
@Publico()
export class WebhookController {
  constructor(@Inject('CONFIG') private readonly config: Configuracion, private readonly db: BaseDatos, private readonly entradas: ServicioEntradas, private readonly cola: ColaWhatsapp) {}
  @Get()
  verificar(@Query('hub.mode') modo?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    if (modo !== 'subscribe' || !token || token !== this.config.metaVerifyToken || !challenge) throw new ForbiddenException('Verificación fallida');
    return challenge;
  }
  @Post() @HttpCode(200)
  async recibir(@Req() req: Request & { rawBody?: Buffer }, @Body() cuerpo: MetaWebhook) {
    if (this.config.whatsappMode !== 'meta') throw new ForbiddenException('Webhook deshabilitado en modo mock');
    if (!req.rawBody || !firmaValida(req.rawBody, req.header('x-hub-signature-256'), this.config.metaAppSecret!)) throw new ForbiddenException('Firma inválida');
    const ids: string[] = [];
    const guardarDesconocido = async (valor: unknown) => {
      const id = `desconocido:${createHash('sha256').update(JSON.stringify(valor)).digest('hex')}`;
      await this.entradas.registrar(id, 'desconocido', valor as object);
      ids.push(id);
    };
    if (cuerpo.object !== 'whatsapp_business_account' || !Array.isArray(cuerpo.entry)) await guardarDesconocido(cuerpo);
    else for (const entrada of cuerpo.entry) for (const cambio of entrada.changes || []) {
      const valor = cambio.value;
      const phoneNumberId = valor?.metadata?.phone_number_id;
      const registrado = phoneNumberId ? await this.db.canalWhatsapp.findUnique({ where: { phoneNumberId } }) : null;
      const canal = registrado?.proveedor === 'META' ? registrado : null;
      let reconocido = false;
      if (cambio.field === 'messages' || cambio.field === 'smb_message_echoes') {
        for (const mensaje of cambio.field === 'messages' ? valor?.messages || [] : []) {
          if (!mensaje.id || !mensaje.from || !phoneNumberId) { await guardarDesconocido({ field: cambio.field, metadata: valor?.metadata, mensaje }); continue; }
          reconocido = true;
          if (canal) {
            const payload: MensajeCanal = { idExterno: mensaje.id, phoneNumberId, waId: mensaje.from, telefono: mensaje.from, nombre: valor?.contacts?.find(c => c.wa_id === mensaje.from)?.profile?.name, tipo: tipoMensaje(mensaje.type), contenido: contenidoMensaje(mensaje), opcionId: mensaje.interactive?.list_reply?.id || mensaje.interactive?.button_reply?.id, fechaWhatsapp: fechaMeta(mensaje.timestamp) };
            await this.entradas.registrar(mensaje.id, 'mensaje_canal', payload as unknown as object);
          } else if (!registrado && this.config.metaPhoneNumberId === phoneNumberId) {
            const opcionId = mensaje.interactive?.list_reply?.id || mensaje.interactive?.button_reply?.id;
            const payload: EntradaCliente = { idExterno: mensaje.id, waId: mensaje.from, telefono: mensaje.from, nombre: valor?.contacts?.find(c => c.wa_id === mensaje.from)?.profile?.name, tipo: mensaje.type === 'interactive' ? 'INTERACTIVO' : 'TEXTO', contenido: contenidoMensaje(mensaje), opcionId, fechaWhatsapp: fechaMeta(mensaje.timestamp) };
            await this.entradas.registrar(mensaje.id, 'mensaje', payload as unknown as object);
          } else await guardarDesconocido({ field: cambio.field, metadata: valor?.metadata, mensaje });
          if (canal || (!registrado && this.config.metaPhoneNumberId === phoneNumberId)) ids.push(mensaje.id);
        }
        for (const eco of cambio.field === 'smb_message_echoes' ? (valor?.message_echoes || valor?.messages || []) : (valor?.message_echoes || [])) {
          if (!eco.id || !eco.to || !phoneNumberId || !canal) { await guardarDesconocido({ field: cambio.field, metadata: valor?.metadata, eco }); continue; }
          reconocido = true;
          const payload: EcoCanal = { idExterno: eco.id, phoneNumberId, destinatario: eco.to, tipo: tipoMensaje(eco.type), contenido: contenidoMensaje(eco), fechaWhatsapp: fechaMeta(eco.timestamp) };
          await this.entradas.registrar(eco.id, 'eco_canal', payload as unknown as object);
          ids.push(eco.id);
        }
        for (const estado of valor?.statuses || []) {
          if (!estado.id || !estado.status) continue;
          reconocido = true;
          const id = `estado:${estado.id}:${estado.status}:${estado.timestamp || ''}`;
          await this.entradas.registrar(id, 'estado', { wamid: estado.id, estado: estado.status });
          ids.push(id);
        }
      }
      if (!reconocido) await guardarDesconocido(cambio);
    }
    try { for (const id of new Set(ids)) await this.cola.encolar(id); }
    catch { throw new ServiceUnavailableException('No se pudo encolar el webhook; Meta debe reintentar'); }
    return { ok: true };
  }
}
