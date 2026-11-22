// Genera un JWT HS256 de desarrollo sin dependencias.  node scripts/token.mjs ADMINISTRADOR [service]
import { createHmac } from 'node:crypto';
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function token(rol = 'ADMINISTRADOR', servicio = false) {
  const secreto = servicio ? (process.env.INTERNAL_JWT_SECRET ?? 'dev-internal-secret-change-me') : (process.env.JWT_SECRET ?? 'dev-user-secret-change-me');
  const h = b({ alg: 'HS256', typ: 'JWT' });
  const p = b({ sub: 'b0000000-0000-4000-8000-000000000001', roles: [rol], ...(servicio ? { typ: 'service' } : {}), exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${h}.${p}.${createHmac('sha256', secreto).update(`${h}.${p}`).digest('base64url')}`;
}
if (process.argv[1].endsWith('token.mjs')) console.log(token(process.argv[2], process.argv[3] === 'service'));
