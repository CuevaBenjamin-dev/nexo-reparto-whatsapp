import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BaseDatos } from './base-datos';
import { leerConfiguracion } from './config';
import { GuardiaSesion, AuthController, Publico, ProteccionLogin } from './auth';
import { ServicioReparto } from './reparto';
import { TiempoReal, TiempoRealController } from './tiempo-real';
import { ProveedorWhatsAppMeta, ProveedorWhatsAppMock, PROVEEDOR_WHATSAPP } from './proveedor-whatsapp';
import { ServicioEntradas } from './entradas';
import { ColaWhatsapp } from './cola';
import { WebhookController } from './webhook';
import { SimuladorController } from './simulador';
import { ServicioConversaciones } from './conversaciones';
import { ConversacionesController } from './conversaciones.controller';
import { GruposController, AsesoresController, OpcionesController, UsuariosController, DashboardController, AuditoriaController, ConfiguracionController } from './administracion';

@Controller('salud')
@Publico()
class SaludController {
  constructor(private readonly db: BaseDatos, private readonly cola: ColaWhatsapp) {}
  @Get() async obtener() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      if (!await this.cola.salud()) throw new Error('Redis no disponible');
      return { estado: 'ok', postgres: true, redis: true };
    } catch { throw new ServiceUnavailableException({ estado: 'degradado', postgresRedis: false }); }
  }
}

@Module({
  controllers: [SaludController, AuthController, TiempoRealController, WebhookController, SimuladorController, ConversacionesController, GruposController, AsesoresController, OpcionesController, UsuariosController, DashboardController, AuditoriaController, ConfiguracionController],
  providers: [
    { provide: 'CONFIG', useFactory: leerConfiguracion },
    BaseDatos, GuardiaSesion, ProteccionLogin, { provide: APP_GUARD, useExisting: GuardiaSesion },
    ServicioReparto, TiempoReal, ProveedorWhatsAppMock, ProveedorWhatsAppMeta,
    { provide: PROVEEDOR_WHATSAPP, useFactory: (config: ReturnType<typeof leerConfiguracion>, mock: ProveedorWhatsAppMock, meta: ProveedorWhatsAppMeta) => config.whatsappMode === 'meta' ? meta : mock, inject: ['CONFIG', ProveedorWhatsAppMock, ProveedorWhatsAppMeta] },
    ServicioEntradas, ColaWhatsapp, ServicioConversaciones,
  ],
})
export class AppModule {}
