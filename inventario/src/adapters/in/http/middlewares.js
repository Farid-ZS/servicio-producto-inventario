import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { DomainError } from '../../../domain/errors.js';
import { permisosDe } from '../../../config/roles.js';

/** 1) Correlación: debe ir primero para que toda respuesta (incluso 401/403) lleve correlationId. */
export function correlacion(req, res, next) {
  req.correlationId = req.get('X-Correlation-Id') || randomUUID();
  res.set('X-Correlation-Id', req.correlationId);
  next();
}

/** 2) Autenticación: valida el JWT firmado y construye el actor con permisos derivados del rol (ADR-018/021). */
export const autenticar = (secretos) => (req, _res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') ?? '');
  if (!m) return next(new DomainError('UNAUTHORIZED', 'Falta el token de autenticación', {}, 401));
  for (const [tipo, secreto] of Object.entries(secretos)) {
    try {
      const c = jwt.verify(m[1], secreto, { algorithms: ['HS256'] });
      if ((c.typ ?? 'user') !== tipo) continue; // un token de servicio no puede firmarse con el secreto de usuarios
      req.actor = { id: c.sub, tipo, roles: c.roles ?? [], permisos: permisosDe(c.roles) };
      return next();
    } catch { /* prueba con el siguiente secreto */ }
  }
  next(new DomainError('UNAUTHORIZED', 'Token inválido o expirado', {}, 401));
};

/** 3) RBAC antes del controlador: una solicitud no autorizada nunca llega al caso de uso ni a PostgreSQL. */
export const requierePermiso = (permiso) => (req, _res, next) =>
  req.actor?.permisos.includes(permiso)
    ? next()
    : next(new DomainError('UNAUTHORIZED', 'La identidad no tiene permiso para esta operación', { permission: permiso }, 403));

export const asincrono = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/** 4) Errores uniformes { code, message, details, correlationId } (ADR-022). Un fallo técnico nunca devuelve 2xx. */
export const manejarErrores = (log) => (error, req, res, _next) => {
  if (error instanceof DomainError) {
    return res.status(error.statusCode).json({ code: error.code, message: error.message, details: error.details, correlationId: req.correlationId });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_REQUEST', message: 'JSON inválido', details: {}, correlationId: req.correlationId });
  }
  log.error({ error, correlationId: req.correlationId }, 'error no controlado');
  res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'Error interno temporal', details: {}, correlationId: req.correlationId });
};
