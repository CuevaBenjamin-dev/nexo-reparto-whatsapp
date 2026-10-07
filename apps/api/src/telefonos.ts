import { BadRequestException } from '@nestjs/common';

/** Identificador telefónico E.164 sin el signo +, usado en Meta y en la base. */
export function normalizarTelefono(valor: string): string {
  let digitos = valor.replace(/[\s()+.-]/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  // Los celulares peruanos locales se reciben a menudo sin el prefijo 51.
  if (/^9\d{8}$/.test(digitos)) digitos = `51${digitos}`;
  if (!/^\d{7,15}$/.test(digitos)) throw new BadRequestException('Número de teléfono inválido');
  return digitos;
}
