import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { Roles } from './auth';
import { Configuracion } from './config';
import { ServicioEntradas, EntradaCliente } from './entradas';
import { BaseDatos } from './base-datos';
import { EcoCanal, MensajeCanal } from './operacion-v2';
import { normalizarTelefono } from './telefonos';

class SimulacionDto {
  @IsString() @Matches(/^\d{7,15}$/) telefono!: string;
  @IsIn(['TEXTO', 'INTERACTIVO']) tipo!: 'TEXTO' | 'INTERACTIVO';
  @IsString() @MaxLength(4096) contenido!: string;
  @IsOptional() @IsString() opcionId?: string;
}
class SimulacionCanalDto {
  @IsString() @Matches(/^\+?[\d\s()-]{7,25}$/) telefono!: string;
  @IsString() @MaxLength(4096) contenido!: string;
  @IsOptional() @IsString() @MaxLength(100) nombre?: string;
}

@Controller('simulador')
@Roles('ADMIN', 'SUPERVISOR')
export class SimuladorController {
  constructor(@Inject('CONFIG') private readonly config: Configuracion, private readonly entradas: ServicioEntradas, private readonly db: BaseDatos) {}
  private comprobar() { if (this.config.nodeEnv === 'production' || this.config.whatsappMode !== 'mock') throw new BadRequestException('El simulador solo está disponible en desarrollo y modo mock'); }
  @Post('entrada')
  async enviar(@Body() dto: SimulacionDto) {
    this.comprobar();
    const idExterno = `mock:${randomUUID()}`;
    const entrada: EntradaCliente = { idExterno, waId: dto.telefono, telefono: dto.telefono, tipo: dto.tipo, contenido: dto.contenido, opcionId: dto.opcionId };
    await this.entradas.registrar(idExterno, 'mensaje', entrada as unknown as object);
    await this.entradas.procesar(idExterno);
    return this.historial(dto.telefono);
  }
  @Post('v2/repartidor')
  async repartidor(@Body() dto: SimulacionCanalDto) {
    this.comprobar();
    const canal = await this.db.canalWhatsapp.findFirst({ where: { tipo: 'REPARTIDOR', activo: true, estadoIntegracion: 'ACTIVO' } });
    if (!canal?.phoneNumberId) throw new BadRequestException('Configura un canal repartidor activo');
    return this.simularCanal(canal.phoneNumberId, dto, 'mensaje_canal');
  }
  @Post('v2/asesor/:canalId/entrada')
  async entradaAsesor(@Param('canalId') canalId: string, @Body() dto: SimulacionCanalDto) {
    this.comprobar();
    const canal = await this.db.canalWhatsapp.findFirst({ where: { id: Number(canalId), tipo: 'ASESOR', activo: true, estadoIntegracion: 'ACTIVO' } });
    if (!canal?.phoneNumberId) throw new BadRequestException('Canal asesor no operativo');
    return this.simularCanal(canal.phoneNumberId, dto, 'mensaje_canal');
  }
  @Post('v2/asesor/:canalId/eco')
  async ecoAsesor(@Param('canalId') canalId: string, @Body() dto: SimulacionCanalDto) {
    this.comprobar();
    const canal = await this.db.canalWhatsapp.findFirst({ where: { id: Number(canalId), tipo: 'ASESOR', activo: true, estadoIntegracion: 'ACTIVO' } });
    if (!canal?.phoneNumberId) throw new BadRequestException('Canal asesor no operativo');
    return this.simularCanal(canal.phoneNumberId, dto, 'eco_canal');
  }
  private async simularCanal(phoneNumberId: string, dto: SimulacionCanalDto, tipo: 'mensaje_canal' | 'eco_canal') {
    const telefono = normalizarTelefono(dto.telefono);
    const idExterno = `mock:${randomUUID()}`;
    const payload: MensajeCanal | EcoCanal = tipo === 'eco_canal'
      ? { idExterno, phoneNumberId, destinatario: telefono, tipo: 'TEXTO', contenido: dto.contenido }
      : { idExterno, phoneNumberId, waId: telefono, telefono, nombre: dto.nombre, tipo: 'TEXTO', contenido: dto.contenido };
    await this.entradas.registrar(idExterno, tipo, payload as unknown as object);
    await this.entradas.procesar(idExterno);
    return this.db.conversacion.findMany({ where: { contacto: { waId: telefono } }, include: { contacto: true, canal: true, solicitudReparto: true, mensajes: { orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }] } }, orderBy: { id: 'desc' }, take: 10 });
  }
  @Get(':telefono')
  async historial(@Param('telefono') telefono: string) {
    this.comprobar();
    if (!/^\d{7,15}$/.test(telefono)) throw new BadRequestException('Número inválido');
    return this.db.conversacion.findMany({ where: { contacto: { waId: normalizarTelefono(telefono) } }, include: { contacto: true, grupo: true, canal: true, solicitudReparto: true, asesor: { include: { usuario: { select: { nombre: true, apellido: true } } } }, mensajes: { orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }] } }, orderBy: { id: 'desc' }, take: 10 });
  }
}
