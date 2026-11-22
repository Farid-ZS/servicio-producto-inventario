import { createHash } from 'node:crypto';
import { DomainError, invalid } from '../domain/errors.js';

const estable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
export const hashPayload = (p) => createHash('sha256').update(estable(p)).digest('hex');

export function exigirClave(clave) {
  if (typeof clave !== 'string' || clave.length < 8 || clave.length > 128) throw invalid('Se requiere el encabezado Idempotency-Key (8 a 128 caracteres)');
}

/**
 * ADR-023. Dentro de la transacción: misma clave+payload => resultado original sin re-ejecutar;
 * misma clave con otro payload/operación => 409 IDEMPOTENCY_KEY_REUSE. Los errores de negocio hacen rollback y no se memorizan.
 */
export async function ejecutarIdempotente(repos, { clave, operacion, payload, ahora }, accion) {
  const hash = hashPayload({ operacion, payload });
  const previo = await repos.idempotencia.obtener(clave, new Date(ahora.getTime() - 24 * 3600 * 1000));
  if (previo) {
    if (previo.payloadHash !== hash || previo.operacion !== operacion) throw new DomainError('IDEMPOTENCY_KEY_REUSE', 'La Idempotency-Key ya se usó con otra solicitud', { key: clave });
    return { resultado: previo.resultado, repetido: true };
  }
  const resultado = await accion();
  await repos.idempotencia.guardar({ clave, operacion, payloadHash: hash, resultado, creadaEn: ahora });
  return { resultado, repetido: false };
}
