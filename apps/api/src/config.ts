export type ModoWhatsapp = 'mock' | 'meta';

export interface Configuracion {
  nodeEnv: string;
  webUrl: string;
  apiUrl: string;
  databaseUrl: string;
  redisUrl: string;
  authSecret: string;
  cookieSecret: string;
  puerto: number;
  whatsappMode: ModoWhatsapp;
  metaGraphApiVersion?: string;
  metaAccessToken?: string;
  metaPhoneNumberId?: string;
  metaWabaId?: string;
  metaAppSecret?: string;
  metaVerifyToken?: string;
  metaPortfolioId?: string;
  whatsappDisplayNumber?: string;
}

export function leerConfiguracion(env: NodeJS.ProcessEnv = process.env): Configuracion {
  const requerir = (nombre: string): string => {
    const valor = env[nombre]?.trim();
    if (!valor) throw new Error(`Falta la variable obligatoria ${nombre}`);
    return valor;
  };
  const modo = env.WHATSAPP_MODE || 'mock';
  if (modo !== 'mock' && modo !== 'meta') throw new Error('WHATSAPP_MODE debe ser mock o meta');
  const config: Configuracion = {
    nodeEnv: env.NODE_ENV || 'development',
    webUrl: env.WEB_URL || 'http://localhost:3001',
    apiUrl: env.API_URL || 'http://localhost:4000',
    databaseUrl: requerir('DATABASE_URL'),
    redisUrl: requerir('REDIS_URL'),
    authSecret: requerir('AUTH_SECRET'),
    cookieSecret: requerir('COOKIE_SECRET'),
    puerto: Number(env.PUERTO_API || 4000),
    whatsappMode: modo,
    metaGraphApiVersion: env.META_GRAPH_API_VERSION,
    metaAccessToken: env.META_WHATSAPP_ACCESS_TOKEN,
    metaPhoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID,
    metaWabaId: env.META_WHATSAPP_BUSINESS_ACCOUNT_ID,
    metaAppSecret: env.META_APP_SECRET,
    metaVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
    metaPortfolioId: env.META_BUSINESS_PORTFOLIO_ID,
    whatsappDisplayNumber: env.WHATSAPP_BUSINESS_DISPLAY_NUMBER,
  };
  if (config.nodeEnv === 'production' && (config.authSecret.length < 32 || config.cookieSecret.length < 32)) {
    throw new Error('AUTH_SECRET y COOKIE_SECRET deben contener al menos 32 caracteres en producción');
  }
  if (config.nodeEnv === 'production') {
    if ([config.authSecret, config.cookieSecret].some(s => s.startsWith('local_development_') || s.startsWith('replace_with_'))) throw new Error('Cambia AUTH_SECRET y COOKIE_SECRET antes de producción');
    if (!config.webUrl.startsWith('https://') || !config.apiUrl.startsWith('https://')) throw new Error('WEB_URL y API_URL deben usar HTTPS en producción');
  }
  if (modo === 'meta') {
    for (const nombre of ['META_GRAPH_API_VERSION', 'META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_PHONE_NUMBER_ID', 'META_WHATSAPP_BUSINESS_ACCOUNT_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN']) requerir(nombre);
    if (!/^v\d+\.\d+$/.test(config.metaGraphApiVersion!)) throw new Error('META_GRAPH_API_VERSION debe tener formato vN.N');
  }
  if (!Number.isInteger(config.puerto) || config.puerto < 1) throw new Error('PUERTO_API inválido');
  return config;
}
