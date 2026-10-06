import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles, UsuarioActual, UsuarioSesion } from './auth';
import { ServicioConversaciones } from './conversaciones';

class MensajeDto { @IsString() @MaxLength(4096) contenido!: string; }
class ReasignarDto { @IsInt() asesorId!: number; @IsOptional() @IsString() @MaxLength(500) motivo?: string; }

@Controller('conversaciones')
@Roles('ADMIN', 'SUPERVISOR', 'ASESOR')
export class ConversacionesController {
  constructor(private readonly servicio: ServicioConversaciones) {}
  @Get() listar(@UsuarioActual() usuario: UsuarioSesion) { return this.servicio.listar(usuario); }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioSesion) { return this.servicio.obtener(id, usuario); }
  @Post(':id/mensajes') @Roles('ASESOR') responder(@Param('id', ParseIntPipe) id: number, @Body() dto: MensajeDto, @UsuarioActual() usuario: UsuarioSesion) { return this.servicio.responder(id, dto.contenido, usuario); }
  @Post(':id/cerrar') cerrar(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioSesion) { return this.servicio.cerrar(id, usuario); }
  @Post(':id/reasignar') @Roles('ADMIN', 'SUPERVISOR') reasignar(@Param('id', ParseIntPipe) id: number, @Body() dto: ReasignarDto, @UsuarioActual() usuario: UsuarioSesion) { return this.servicio.reasignar(id, dto.asesorId, dto.motivo || '', usuario); }
  @Post(':id/repartir') @Roles('ADMIN', 'SUPERVISOR') repartir(@Param('id', ParseIntPipe) id: number, @UsuarioActual() usuario: UsuarioSesion) { return this.servicio.repartirPendiente(id, usuario); }
}
