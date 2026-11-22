// RBAC (ADR-018/021). Permisos derivados del rol/identidad en el servidor.
export const PERMISOS_POR_ROL = Object.freeze({
  ADMINISTRADOR: ['inventory:availability:read', 'inventory:history', 'inventory:admin'],
  ALMACENERO: ['inventory:availability:read', 'inventory:write'],
  VENDEDOR: ['inventory:availability:read'],
  SERVICE_PRODUCTOS: ['inventory:availability:read'], // Productos SOLO consulta disponibilidad
  SERVICE_PEDIDOS: ['inventory:availability:read', 'inventory:reservations'], // Pedidos y Pagos reserva/libera/liquida
});
export const permisosDe = (roles = []) => [...new Set(roles.flatMap((r) => PERMISOS_POR_ROL[r] ?? []))];
