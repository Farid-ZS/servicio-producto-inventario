// RBAC (ADR-018). Los permisos se derivan del rol en el servidor; nunca se confía en permisos del token.
export const PERMISOS_POR_ROL = Object.freeze({
  ADMINISTRADOR: ['products:write', 'products:read'],
  VENDEDOR: ['products:read'],
  ALMACENERO: ['products:read'],
  'SERVICE_PEDIDOS': ['products:read'],
});
export const permisosDe = (roles = []) => [...new Set(roles.flatMap((r) => PERMISOS_POR_ROL[r] ?? []))];
