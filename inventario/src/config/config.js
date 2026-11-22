const env = process.env;
export const config = {
  port: Number(env.PORT ?? 3002),
  databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/db_operaciones',
  redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
  rabbitUrl: env.RABBITMQ_URL ?? null,
  jwtSecret: env.JWT_SECRET ?? 'dev-user-secret-change-me',
  internalJwtSecret: env.INTERNAL_JWT_SECRET ?? 'dev-internal-secret-change-me',
  ttlDisponibilidadSeg: Number(env.TTL_DISPONIBILIDAD_SEG ?? 30), // ADR-028
  reservaTtlMinutos: Number(env.RESERVA_TTL_MINUTOS ?? 60), // RF-INV-13: vigencia por defecto si Pedidos no envía expiresAt
  expiracionIntervaloMs: Number(env.EXPIRACION_INTERVALO_MS ?? 30000), // ADR-015: worker de seguridad
  outboxIntervaloMs: Number(env.OUTBOX_INTERVALO_MS ?? 1000),
  maxReintentosEvento: Number(env.MAX_REINTENTOS_EVENTO ?? 5),
  reintentoEventoMs: Number(env.REINTENTO_EVENTO_MS ?? 5000),
};
