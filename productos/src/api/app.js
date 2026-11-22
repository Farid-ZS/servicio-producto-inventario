import express from 'express';
import { asincrono, autenticar, correlacion, manejarErrores, requierePermiso } from './middlewares.js';

const entero = (v, d) => (v === undefined ? d : Number(v));

/** Adaptador de ENTRADA REST: traduce HTTP -> puertos de entrada (casos de uso). No contiene reglas de negocio. */
export function crearApp({ casosDeUso: cu, secretos, log, verificarSalud = async () => {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlacion);
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', asincrono(async (_q, res) => { await verificarSalud(); res.json({ status: 'ok' }); }));

  const auth = autenticar(secretos);
  const ctx = (req) => ({ correlationId: req.correlationId });
  const leer = requierePermiso('products:read');
  const escribir = requierePermiso('products:write');

  // Categorías (CU-PRO-00)
  app.get('/categories', auth, leer, asincrono(async (req, res) => res.json(await cu.categorias.listar(req.actor))));
  app.post('/categories', auth, escribir, asincrono(async (req, res) => res.status(201).json(await cu.categorias.crear(req.body, req.actor))));
  app.patch('/categories/:id', auth, escribir, asincrono(async (req, res) => res.json(await cu.categorias.modificar(req.params.id, req.body, req.actor))));
  app.post('/categories/:id/deactivate', auth, escribir, asincrono(async (req, res) => res.json(await cu.categorias.desactivar(req.params.id, req.actor))));
  app.post('/categories/:id/activate', auth, escribir, asincrono(async (req, res) => res.json(await cu.categorias.activar(req.params.id, req.actor))));

  // Productos (CU-PRO-01..06)
  app.post('/products', auth, escribir, asincrono(async (req, res) => res.status(201).json(await cu.registrar.ejecutar(req.body, req.actor))));
  app.get('/products', auth, leer, asincrono(async (req, res) => {
    const { q, categoryId, status } = req.query;
    res.json(await cu.catalogo.buscar({ texto: q, categoriaId: categoryId, estado: status, page: entero(req.query.page, 1), size: entero(req.query.size, 20) }, req.actor, ctx(req)));
  }));
  app.get('/products/:id', auth, leer, asincrono(async (req, res) => res.json(await cu.catalogo.detalle(req.params.id, req.actor, ctx(req)))));
  app.patch('/products/:id', auth, escribir, asincrono(async (req, res) => res.json(await cu.modificar.ejecutar(req.params.id, req.body, req.actor))));
  app.post('/products/:id/activate', auth, escribir, asincrono(async (req, res) => res.json(await cu.estado.activar(req.params.id, req.actor))));
  app.post('/products/:id/deactivate', auth, escribir, asincrono(async (req, res) => res.json(await cu.estado.desactivar(req.params.id, req.actor))));

  app.use((req, res) => res.status(404).json({ code: 'INVALID_REQUEST', message: 'Ruta no encontrada', details: {}, correlationId: req.correlationId }));
  app.use(manejarErrores(log));
  return app;
}
