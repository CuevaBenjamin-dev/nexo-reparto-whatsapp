import { CanActivate, Controller, ExecutionContext, Get, Injectable, Post, Body, Req, Res, UnauthorizedException, ForbiddenException, SetMetadata, createParamDecorator, Inject, HttpException, OnModuleDestroy } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { randomBytes, createHash, createHmac } from 'crypto';
import * as argon2 from 'argon2';
import { BaseDatos } from './base-datos';
import { Rol } from '@prisma/client';
import { Configuracion } from './config';
import IORedis from 'ioredis';

export interface UsuarioSesion { id: number; nombre: string; apellido: string; correo: string; rol: Rol; asesorId?: number; }
export type SolicitudAutenticada = Request & { usuario?: UsuarioSesion };
export const Publico = () => SetMetadata('publico', true);
export const Roles = (...roles: Rol[]) => SetMetadata('roles', roles);
export const UsuarioActual = createParamDecorator((_dato: unknown, ctx: ExecutionContext): UsuarioSesion => (ctx.switchToHttp().getRequest() as SolicitudAutenticada).usuario!);

@Injectable()
export class GuardiaSesion implements CanActivate {
  constructor(private readonly db: BaseDatos, private readonly reflector: Reflector, @Inject('CONFIG') private readonly config: Configuracion) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('publico', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<SolicitudAutenticada>();
    const cookie = req.signedCookies?.sesion as string | undefined;
    if (!cookie || !/^[a-f0-9]{64}$/.test(cookie)) throw new UnauthorizedException('Inicia sesión');
    const tokenHash = createHmac('sha256', this.config.authSecret).update(cookie).digest('hex');
    const sesion = await this.db.sesion.findUnique({ where: { tokenHash }, include: { usuario: { include: { asesor: true } } } });
    if (!sesion || sesion.venceEn < new Date() || !sesion.usuario.activo) throw new UnauthorizedException('Sesión no válida');
    req.usuario = { id: sesion.usuario.id, nombre: sesion.usuario.nombre, apellido: sesion.usuario.apellido, correo: sesion.usuario.correo, rol: sesion.usuario.rol, asesorId: sesion.usuario.asesor?.id };
    const roles = this.reflector.getAllAndOverride<Rol[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (roles?.length && !roles.includes(req.usuario.rol)) throw new ForbiddenException('Sin permisos');
    return true;
  }
}

class LoginDto {
  @IsEmail() correo!: string;
  @IsString() @MinLength(1) password!: string;
}

@Injectable()
export class ProteccionLogin implements OnModuleDestroy {
  private readonly redis: IORedis;
  constructor(@Inject('CONFIG') config: Configuracion) { this.redis = new IORedis(config.redisUrl); }
  private clave(ip: string, correo: string) { return `login:${createHash('sha256').update(`${ip}:${correo.toLowerCase()}`).digest('hex')}`; }
  async comprobar(ip: string, correo: string) {
    const clave = this.clave(ip, correo);
    const intentos = await this.redis.incr(clave);
    if (intentos === 1) await this.redis.expire(clave, 15 * 60);
    if (intentos > 5) throw new HttpException('Demasiados intentos. Espera 15 minutos.', 429);
  }
  async limpiar(ip: string, correo: string) { await this.redis.del(this.clave(ip, correo)); }
  async onModuleDestroy() { await this.redis.quit(); }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly db: BaseDatos, @Inject('CONFIG') private readonly config: Configuracion, private readonly intentos: ProteccionLogin) {}

  @Publico() @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const origen = req.ip || req.socket.remoteAddress || 'desconocido';
    await this.intentos.comprobar(origen, dto.correo);
    const usuario = await this.db.usuario.findUnique({ where: { correo: dto.correo.toLowerCase() }, include: { asesor: true } });
    if (!usuario || !usuario.activo || !(await argon2.verify(usuario.passwordHash, dto.password))) throw new UnauthorizedException('Credenciales inválidas');
    await this.intentos.limpiar(origen, dto.correo);
    const token = randomBytes(32).toString('hex');
    await this.db.sesion.create({ data: { usuarioId: usuario.id, tokenHash: createHmac('sha256', this.config.authSecret).update(token).digest('hex'), venceEn: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
    const esProduccion = this.config.nodeEnv === 'production';

    res.cookie('sesion', token, {
      signed: true,
      httpOnly: true,
      secure: esProduccion,
      sameSite: esProduccion ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
    return { id: usuario.id, nombre: usuario.nombre, apellido: usuario.apellido, correo: usuario.correo, rol: usuario.rol, asesorId: usuario.asesor?.id };
  }

  @Post('logout')
  async logout(@Req() req: SolicitudAutenticada, @Res({ passthrough: true }) res: Response) {
    const token = req.signedCookies?.sesion as string;
    await this.db.sesion.deleteMany({ where: { tokenHash: createHmac('sha256', this.config.authSecret).update(token).digest('hex') } });
    const esProduccion = this.config.nodeEnv === 'production';

    res.clearCookie('sesion', {
      path: '/',
      secure: esProduccion,
      sameSite: esProduccion ? 'none' : 'lax',
    });
    return { ok: true };
  }

  @Get('me') me(@UsuarioActual() usuario: UsuarioSesion) { return usuario; }
}
