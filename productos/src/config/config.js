const env = process.env;
const req = (k, d) => {
  const v = env[k] ?? d;
  if (v === undefined) throw new Error(`Falta variable de entorno ${k}`);
  return v;
};
export const config = {
  port: Number(env.PORT ?? 3001),
  databaseUrl: req('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/db_core'),
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  rabbitUrl: env.RABBITMQ_URL ?? null, // si falta, el relay de la Outbox queda desactivado
  jwtSecret: req('JWT_SECRET', 'dev-user-secret-change-me'), // tokens de usuarios (Administrador, Vendedor...)
  internalJwtSecret: req('INTERNAL_JWT_SECRET', 'dev-internal-secret-change-me'), // tokens entre microservicios (ADR-021)
  inventarioUrl: env.INVENTARIO_URL ?? 'http://localhost:3002',
  inventarioTimeoutMs: Number(env.INVENTARIO_TIMEOUT_MS ?? 1000), // ADR-003: 1 s, sin reintentos
  ttlProductoSeg: Number(env.TTL_PRODUCTO_SEG ?? 600), // ADR-028: 10 min
  maxReintentosCodigo: Number(env.MAX_REINTENTOS_CODIGO ?? 5), // ADR-016
  outboxIntervaloMs: Number(env.OUTBOX_INTERVALO_MS ?? 1000),
};
