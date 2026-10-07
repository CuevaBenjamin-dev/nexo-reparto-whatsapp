import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Configuracion } from './config';

export interface OpcionMenu { id: string; titulo: string; descripcion?: string | null; }
export interface ProveedorWhatsApp {
  enviarTexto(waId: string, texto: string, phoneNumberId?: string): Promise<string>;
  enviarMenu(waId: string, opciones: OpcionMenu[], phoneNumberId?: string): Promise<string>;
  enviarPlantilla(waId: string, phoneNumberId: string, nombre: string, idioma: string, parametros: string[]): Promise<string>;
}

@Injectable()
export class ProveedorWhatsAppMock implements ProveedorWhatsApp {
  async enviarTexto(): Promise<string> { return `mock:${randomUUID()}`; }
  async enviarMenu(): Promise<string> { return `mock:${randomUUID()}`; }
  async enviarPlantilla(): Promise<string> { return `mock:${randomUUID()}`; }
}

@Injectable()
export class ProveedorWhatsAppMeta implements ProveedorWhatsApp {
  constructor(@Inject('CONFIG') private readonly config: Configuracion) {}
  private async enviar(waId: string, cuerpo: Record<string, unknown>, phoneNumberId?: string): Promise<string> {
    const emisor = phoneNumberId || this.config.metaPhoneNumberId;
    if (!emisor) throw new Error('El canal no tiene Phone Number ID configurado');
    const url = `https://graph.facebook.com/${this.config.metaGraphApiVersion}/${encodeURIComponent(emisor)}/messages`;
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.metaAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: waId, ...cuerpo }),
      signal: AbortSignal.timeout(10000),
    });
    const resultado = await respuesta.json() as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
    if (!respuesta.ok || !resultado.messages?.[0]?.id) throw new Error(`Meta rechazó envío (${respuesta.status}, código ${resultado.error?.code ?? 'sin código'})`);
    return resultado.messages[0].id;
  }
  enviarTexto(waId: string, texto: string, phoneNumberId?: string) { return this.enviar(waId, { type: 'text', text: { preview_url: false, body: texto } }, phoneNumberId); }
  enviarMenu(waId: string, opciones: OpcionMenu[], phoneNumberId?: string) {
    if (opciones.length < 1 || opciones.length > 10) throw new Error('El menú debe tener entre 1 y 10 opciones activas');
    return this.enviar(waId, { type: 'interactive', interactive: { type: 'list', body: { text: '¿En qué podemos ayudarte?' }, action: { button: 'Ver opciones', sections: [{ title: 'Áreas de atención', rows: opciones.map(o => ({ id: o.id, title: o.titulo.slice(0, 24), description: o.descripcion?.slice(0, 72) || undefined })) }] } } }, phoneNumberId);
  }
  enviarPlantilla(waId: string, phoneNumberId: string, nombre: string, idioma: string, parametros: string[]) {
    return this.enviar(waId, { type: 'template', template: { name: nombre, language: { code: idioma }, components: [{ type: 'body', parameters: parametros.map(texto => ({ type: 'text', text: texto })) }] } }, phoneNumberId);
  }
}

export const PROVEEDOR_WHATSAPP = Symbol('PROVEEDOR_WHATSAPP');
