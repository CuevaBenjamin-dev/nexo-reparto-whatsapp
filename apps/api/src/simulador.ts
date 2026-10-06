import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { Publico } from './auth';
import { Configuracion } from './config';
import { ServicioEntradas, EntradaCliente } from './entradas';
import { BaseDatos } from './base-datos';

class SimulacionDto {
  @IsString() @Matches(/^\d{7,15}$/) telefono!: string;
  @IsIn(['TEXTO', 'INTERACTIVO']) tipo!: 'TEXTO' | 'INTERACTIVO';
  @IsString() @MaxLength(4096) contenido!: string;
  @IsOptional() @IsString() opcionId?: string;
}

@Controller('simulador')
@Publico()
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
  @Get(':telefono')
  async historial(@Param('telefono') telefono: string) {
    this.comprobar();
    if (!/^\d{7,15}$/.test(telefono)) throw new BadRequestException('Número inválido');
    return this.db.conversacion.findMany({ where: { contacto: { waId: telefono } }, include: { contacto: true, grupo: true, asesor: { include: { usuario: { select: { nombre: true, apellido: true } } } }, mensajes: { orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }] } }, orderBy: { id: 'desc' }, take: 10 });
  }
}
