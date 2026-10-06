import { Body, Controller, ForbiddenException, Get, HttpCode, HttpException, Inject, Post, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Publico } from './auth';
import { Configuracion } from './config';
import { ServicioEntradas, EntradaCliente } from './entradas';
import { ColaWhatsapp } from './cola';

export function firmaValida(raw: Buffer, firma: string | undefined, secreto: string): boolean {
  if (!firma || !/^sha256=[a-f0-9]{64}$/.test(firma)) return false;
  const esperado = Buffer.from(createHmac('sha256', secreto).update(raw).digest('hex'), 'hex');
  const recibido = Buffer.from(firma.slice(7), 'hex');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

interface MetaMensaje { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; interactive?: { type?: string; list_reply?: { id?: string; title?: string }; button_reply?: { id?: string; title?: string } }; }
interface MetaEstado { id?: string; status?: string; timestamp?: string; recipient_id?: string; }
interface MetaWebhook {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: MetaMensaje[];
        statuses?: MetaEstado[];
      };
    }>;
  }>;
}

@Controller('webhooks/meta/whatsapp')
@Publico()
export class WebhookController {
  constructor(@Inject('CONFIG') private readonly config: Configuracion, private readonly entradas: ServicioEntradas, private readonly cola: ColaWhatsapp) {}
  @Get()
  verificar(@Query('hub.mode') modo?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    if (modo !== 'subscribe' || !token || token !== this.config.metaVerifyToken || !challenge) throw new ForbiddenException('Verificación fallida');
    return challenge;
  }
  @Post() @HttpCode(200)
  async recibir(@Req() req: Request & { rawBody?: Buffer }, @Body() cuerpo: MetaWebhook) {
    if (this.config.whatsappMode !== 'meta') throw new ForbiddenException('Webhook deshabilitado en modo mock');
    if (!req.rawBody || !firmaValida(req.rawBody, req.header('x-hub-signature-256'), this.config.metaAppSecret!)) throw new ForbiddenException('Firma inválida');
    if (cuerpo.object !== 'whatsapp_business_account') throw new HttpException('Objeto no soportado', 400);
    const ids: string[] = [];
    for (const entrada of cuerpo.entry || []) for (const cambio of entrada.changes || []) {
      if (cambio.field !== 'messages') continue;
      for (const mensaje of cambio.value?.messages || []) {
        if (!mensaje.id || !mensaje.from) continue;
        const tipo = mensaje.type === 'interactive' ? 'INTERACTIVO' : 'TEXTO';
        if (tipo === 'TEXTO' && mensaje.type !== 'text') continue;
        const opcionId = mensaje.interactive?.list_reply?.id || mensaje.interactive?.button_reply?.id;
        const payload: EntradaCliente = { idExterno: mensaje.id, waId: mensaje.from, telefono: mensaje.from, nombre: cambio.value?.contacts?.find(c => c.wa_id === mensaje.from)?.profile?.name, tipo, contenido: mensaje.text?.body || mensaje.interactive?.list_reply?.title || mensaje.interactive?.button_reply?.title || '', opcionId, fechaWhatsapp: mensaje.timestamp ? new Date(Number(mensaje.timestamp) * 1000).toISOString() : undefined };
        await this.entradas.registrar(mensaje.id, 'mensaje', payload as unknown as object);
        ids.push(mensaje.id);
      }
      for (const estado of cambio.value?.statuses || []) {
        if (!estado.id || !estado.status) continue;
        const id = `estado:${estado.id}:${estado.status}:${estado.timestamp || ''}`;
        await this.entradas.registrar(id, 'estado', { wamid: estado.id, estado: estado.status });
        ids.push(id);
      }
    }
    try { for (const id of ids) await this.cola.encolar(id); }
    catch { throw new ServiceUnavailableException('No se pudo encolar el webhook; Meta debe reintentar'); }
    return { ok: true };
  }
}
