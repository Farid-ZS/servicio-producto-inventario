import { createHash } from 'node:crypto';
import { logger } from '../../../shared/logger.js';

/**
 * PROXY de caché (GoF, ADR-011/028): misma interfaz que RepositorioDisponibilidad. TTL 30 s, solo INFORMATIVO.
 * Claves: availability:{productId} y availability:batch:{idsHash}. Si Redis falla => PostgreSQL.
 * También implementa el puerto CacheDisponibilidad.invalidar (lo usa el Observer tras el commit).
 */
export class RepositorioDisponibilidadConCache {
  constructor({ real, redis, ttlSeg = 30, log = logger }) { Object.assign(this, { real, redis, ttlSeg, log }); }

  async consultarPorLote(ids) {
    const clave = ids.length === 1 ? `availability:${ids[0]}` : `availability:batch:${createHash('sha1').update([...ids].sort().join(',')).digest('hex')}`;
    try {
      const c = await this.redis.get(clave);
      if (c) return { source: 'cache', items: JSON.parse(c) };
    } catch (error) { this.log.error({ error, clave }, 'Redis no disponible; se usa PostgreSQL'); }
    const { items } = await this.real.consultarPorLote(ids);
    try { await this.redis.set(clave, JSON.stringify(items), 'EX', this.ttlSeg); }
    catch (error) { this.log.error({ error, clave }, 'No se pudo actualizar la caché'); }
    return { source: 'db', items };
  }

  async invalidar(ids) {
    try {
      await this.redis.del(...ids.map((id) => `availability:${id}`));
      let cursor = '0';
      do {
        const [sig, claves] = await this.redis.scan(cursor, 'MATCH', 'availability:batch:*', 'COUNT', 200);
        if (claves.length) await this.redis.del(...claves);
        cursor = sig;
      } while (cursor !== '0');
    } catch (error) { this.log.error({ error }, 'No se pudo invalidar (el TTL de 30 s limita la obsolescencia)'); }
  }
}
