import { createHash } from 'node:crypto';
import { DomainError, esUuid } from '../domain/errors.js';

export function exigirPermiso(actor, permiso) { // segunda barrera de RBAC (ADR-018)
  if (!actor || !actor.permisos?.includes(permiso)) throw new DomainError('UNAUTHORIZED', 'La identidad no tiene permiso para esta operación', { permission: permiso });
}
/** usuario_id es UUID: usuarios usan su `sub`; las identidades de servicio se mapean de forma determinista. */
export function usuarioResponsable(actor) {
  if (esUuid(actor.id)) return actor.id;
  const h = createHash('sha1').update(`actor:${actor.id}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
