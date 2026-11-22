// Contrato común de errores (ADR-022): { code, message, details, correlationId }
const HTTP = {
  INSUFFICIENT_STOCK: 409, PRODUCT_NOT_FOUND: 404, PRODUCT_INACTIVE: 409, RESERVATION_NOT_FOUND: 404,
  RESERVATION_EXPIRED: 409, RESERVED_STOCK_CONFLICT: 409, REQUEST_TIMEOUT: 504, SERVICE_UNAVAILABLE: 503,
  UNAUTHORIZED: 403, INVALID_REQUEST: 400, IDEMPOTENCY_KEY_REUSE: 409,
};
export class DomainError extends Error {
  constructor(code, message, details = {}, status) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.statusCode = status ?? HTTP[code] ?? 400;
  }
}
export const invalid = (message, details) => new DomainError('INVALID_REQUEST', message, details);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const esUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
