import jwt from 'jsonwebtoken';
/** Identidad propia del microservicio con tokens de corta duración (ADR-021). */
export class FirmanteTokenServicio {
  constructor({ secreto, servicio = 'productos-service', roles = ['SERVICE_PRODUCTOS'], ttlSeg = 60 }) { Object.assign(this, { secreto, servicio, roles, ttlSeg }); }
  firmar() { return jwt.sign({ typ: 'service', roles: this.roles }, this.secreto, { subject: this.servicio, expiresIn: this.ttlSeg, algorithm: 'HS256' }); }
}
