import { Injectable, Controller, Sse, MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { UsuarioActual, UsuarioSesion, Roles } from './auth';

interface Cambio { tipo: string; conversacionId?: number; asesorUsuarios?: number[]; [clave: string]: unknown; }

@Injectable()
export class TiempoReal {
  private readonly cambios = new Subject<Cambio>();
  publicar(cambio: Cambio): void { this.cambios.next(cambio); }
  eventosPara(usuario: UsuarioSesion): Observable<MessageEvent> {
    return this.cambios.pipe(
      filter(c => usuario.rol === 'ADMIN' || usuario.rol === 'SUPERVISOR' || Boolean(c.asesorUsuarios?.includes(usuario.id))),
      map(c => ({ data: c, type: c.tipo })),
    );
  }
}

@Controller('tiempo-real')
@Roles('ADMIN', 'SUPERVISOR', 'ASESOR')
export class TiempoRealController {
  constructor(private readonly tiempoReal: TiempoReal) {}
  @Sse('eventos') eventos(@UsuarioActual() usuario: UsuarioSesion) { return this.tiempoReal.eventosPara(usuario); }
}
