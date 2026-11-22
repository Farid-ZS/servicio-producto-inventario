import { DomainError } from '../domain/errors.js';
/** Segunda barrera de RBAC (ADR-018): el caso de uso revalida aunque el middleware ya filtró. */
export function exigirPermiso(actor, permiso) {
  if (!actor || !actor.permisos?.includes(permiso)) {
    throw new DomainError('UNAUTHORIZED', 'La identidad no tiene permiso para esta operación', { permission: permiso });
  }
}
