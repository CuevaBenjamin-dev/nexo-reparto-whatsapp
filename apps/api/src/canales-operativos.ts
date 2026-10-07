import { CanalWhatsapp, Prisma, ProveedorCanalWhatsapp } from '@prisma/client';
import { ModoWhatsapp } from './config';

export function proveedorDelModo(modo: ModoWhatsapp): ProveedorCanalWhatsapp {
  return modo === 'meta' ? 'META' : 'MOCK';
}

export function filtroCanalOperativo(modo: ModoWhatsapp): Prisma.CanalWhatsappWhereInput {
  return {
    tipo: 'ASESOR', proveedor: proveedorDelModo(modo), activo: true, estadoIntegracion: 'ACTIVO',
    asesorId: { not: null }, numeroVisible: { not: '' }, phoneNumberId: { not: '' },
    ...(modo === 'meta' ? { wabaId: { not: '' } } : {}),
  };
}

export function canalOperativo(canal: CanalWhatsapp | null | undefined, modo: ModoWhatsapp): canal is CanalWhatsapp & { phoneNumberId: string; asesorId: number } {
  return Boolean(canal && canal.tipo === 'ASESOR' && canal.proveedor === proveedorDelModo(modo) &&
    canal.activo && canal.estadoIntegracion === 'ACTIVO' && canal.asesorId &&
    canal.numeroVisible?.trim() && canal.phoneNumberId?.trim() &&
    (modo === 'mock' || (/^\d+$/.test(canal.phoneNumberId || '') && /^\d+$/.test(canal.wabaId || ''))));
}

export function repartidorOperativo(canal: CanalWhatsapp | null | undefined, modo: ModoWhatsapp): canal is CanalWhatsapp & { phoneNumberId: string } {
  return Boolean(canal && canal.tipo === 'REPARTIDOR' && canal.proveedor === proveedorDelModo(modo) &&
    canal.activo && canal.estadoIntegracion === 'ACTIVO' && !canal.asesorId &&
    canal.numeroVisible?.trim() && canal.phoneNumberId?.trim() &&
    (modo === 'mock' || /^\d+$/.test(canal.phoneNumberId || '')));
}
