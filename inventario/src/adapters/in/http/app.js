import express from 'express';
import { asincrono, autenticar, correlacion, manejarErrores, requierePermiso } from './middlewares.js';

const entero = (v, d) => (v === undefined ? d : Number(v));
const clave = (req) => ({ idempotencyKey: req.get('Idempotency-Key') });

/** Adaptador de ENTRADA REST de Inventario. Sin reglas de negocio: valida identidad/rol y delega en los puertos de entrada. */
export function crearApp({ casosDeUso: cu, secretos, log, verificarSalud = async () => {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlacion);
  app.use(express.json({ limit: '200kb' }));
  app.get('/health', asincrono(async (_q, res) => { await verificarSalud(); res.json({ status: 'ok' }); }));
  const auth = autenticar(secretos);

  // Disponibilidad (ADR-019)
  app.get('/inventory/availability', auth, requierePermiso('inventory:availability:read'), asincrono(async (req, res) => {
    const productIds = String(req.query.productIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    res.json(await cu.disponibilidad.ejecutar({ productIds }, req.actor));
  }));

  // Movimientos manuales e historial (CU-INV-02/03/06)
  app.post('/inventory/movements', auth, requierePermiso('inventory:write'), asincrono(async (req, res) => res.status(201).json(await cu.movimiento.ejecutar(req.body, req.actor))));
  app.get('/inventory/movements', auth, requierePermiso('inventory:history'), asincrono(async (req, res) => {
    const { productId, type, from, to } = req.query;
    res.json(await cu.historial.ejecutar({ productId, type, from, to, page: entero(req.query.page, 1), size: entero(req.query.size, 50) }, req.actor));
  }));

  // Stock mínimo y alertas (RF-INV-10)
  app.put('/inventory/stock/:productId/minimum', auth, requierePermiso('inventory:admin'), asincrono(async (req, res) =>
    res.json(await cu.minimo.ejecutar({ productId: req.params.productId, minimumStock: req.body?.minimumStock }, req.actor))));
  app.get('/inventory/alerts', auth, requierePermiso('inventory:history'), asincrono(async (req, res) => res.json(await cu.alertas.ejecutar({}, req.actor))));

  // Contrato de reservas (ADR-020): requiere Idempotency-Key (ADR-023)
  const reservas = requierePermiso('inventory:reservations');
  app.post('/inventory/reservations', auth, reservas, asincrono(async (req, res) => res.status(201).json(await cu.reservar.ejecutar(req.body ?? {}, clave(req), req.actor))));
  app.post('/inventory/reservations/:orderId/release', auth, reservas, asincrono(async (req, res) => res.json(await cu.liberar.ejecutar({ orderId: req.params.orderId }, clave(req), req.actor))));
  app.post('/inventory/reservations/:orderId/liquidate', auth, reservas, asincrono(async (req, res) => res.json(await cu.liquidar.ejecutar({ orderId: req.params.orderId }, clave(req), req.actor))));

  app.use((req, res) => res.status(404).json({ code: 'INVALID_REQUEST', message: 'Ruta no encontrada', details: {}, correlationId: req.correlationId }));
  app.use(manejarErrores(log));
  return app;
}
