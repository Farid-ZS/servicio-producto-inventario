import { DomainError } from '../../domain/errors.js';

const LOTE_MAX = 100; // ADR-006 / ADR-019

/**
 * Adaptador de salida: implementa ServicioDisponibilidad llamando al contrato REST de Inventario.
 * Timeout 1 s, SIN reintentos (ADR-003). Un fallo nunca se convierte en disponibilidad verificada.
 */
export class InventarioClient {
  constructor({ baseUrl, firmante, timeoutMs = 1000, fetchImpl = globalThis.fetch }) {
    Object.assign(this, { baseUrl, firmante, timeoutMs, fetchImpl });
  }

  async consultarPorLote(productIds, ctx = {}) {
    const lotes = [];
    for (let i = 0; i < productIds.length; i += LOTE_MAX) lotes.push(productIds.slice(i, i + LOTE_MAX));
    const resultados = await Promise.all(lotes.map((l) => this.#lote(l, ctx)));
    return new Map(resultados.flat().map((r) => [r.productId, r.availableStock]));
  }

  async #lote(ids, ctx) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/inventory/availability?productIds=${ids.join(',')}`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.firmante.firmar()}`, 'X-Correlation-Id': ctx.correlationId ?? '' },
      });
      if (!res.ok) throw new DomainError('SERVICE_UNAVAILABLE', 'Inventario no pudo verificar la disponibilidad; reintente', { upstreamStatus: res.status });
      const cuerpo = await res.json();
      return cuerpo.items ?? [];
    } catch (e) {
      if (e instanceof DomainError) throw e;
      if (e?.name === 'AbortError') throw new DomainError('REQUEST_TIMEOUT', 'Inventario no respondió a tiempo; reintente', { timeoutMs: this.timeoutMs });
      throw new DomainError('SERVICE_UNAVAILABLE', 'Inventario no disponible; reintente', { cause: e?.message });
    } finally { clearTimeout(t); }
  }
}
