import Redis from 'ioredis';
import { config } from './config/config.js';
import { logger } from './shared/logger.js';
import { RegistroEstrategias } from './domain/estrategias/estrategias.js';
import { PUERTOS_ENTRADA, PUERTOS_SALIDA, verificarPuerto } from './application/puertos.js';
import { PublicadorCambioStock, ObservadorAlertaStockBajo, ObservadorInvalidarCache } from './application/observadores/publicador-cambio-stock.js';
import { ConsultarDisponibilidad } from './application/casos-de-uso/consultar-disponibilidad.js';
import { ReservarStock } from './application/casos-de-uso/reservar-stock.js';
import { LiberarReserva } from './application/casos-de-uso/liberar-reserva.js';
import { LiquidarReserva } from './application/casos-de-uso/liquidar-reserva.js';
import { RegistrarMovimiento } from './application/casos-de-uso/registrar-movimiento.js';
import { ConsultarHistorial } from './application/casos-de-uso/consultar-historial.js';
import { ConfigurarStockMinimo } from './application/casos-de-uso/configurar-stock-minimo.js';
import { ExpirarReservasVencidas } from './application/casos-de-uso/expirar-reservas-vencidas.js';
import { SincronizarCicloVidaProducto } from './application/casos-de-uso/sincronizar-ciclo-vida-producto.js';
import { ConsultarAlertas } from './application/casos-de-uso/consultar-alertas.js';
import { crearPool } from './adapters/out/postgres/pool.js';
import { migrar } from './adapters/out/postgres/migrar.js';
import { UnidadDeTrabajoPg } from './adapters/out/postgres/unidad-de-trabajo-pg.js';
import { RepositorioDisponibilidadPg } from './adapters/out/postgres/repositorio-disponibilidad-pg.js';
import { RepositorioHistorialPg } from './adapters/out/postgres/repositorio-historial-pg.js';
import { RepositorioAlertasPg } from './adapters/out/postgres/repositorio-alertas-pg.js';
import { OutboxRelay } from './adapters/out/postgres/outbox-relay.js';
import { RepositorioDisponibilidadConCache } from './adapters/out/redis/repositorio-disponibilidad-con-cache.js';
import { RabbitPublicador } from './adapters/out/messaging/rabbit-publicador.js';
import { ConsumidorProductos } from './adapters/in/messaging/consumidor-productos.js';
import { crearApp } from './adapters/in/http/app.js';

// ---------- Raíz de composición ----------
const pool = crearPool(config.databaseUrl);
await migrar(pool, logger);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on('error', (error) => logger.error({ error }, 'Redis'));

const uow = verificarPuerto(PUERTOS_SALIDA, 'UnidadDeTrabajo', new UnidadDeTrabajoPg(pool));
const cache = new RepositorioDisponibilidadConCache({ real: new RepositorioDisponibilidadPg(pool), redis, ttlSeg: config.ttlDisponibilidadSeg });
const disponibilidad = verificarPuerto(PUERTOS_SALIDA, 'RepositorioDisponibilidad', cache);
verificarPuerto(PUERTOS_SALIDA, 'CacheDisponibilidad', cache);
const historial = verificarPuerto(PUERTOS_SALIDA, 'RepositorioHistorial', new RepositorioHistorialPg(pool));
const alertas = verificarPuerto(PUERTOS_SALIDA, 'RepositorioAlertas', new RepositorioAlertasPg(pool));

const publicador = new PublicadorCambioStock(logger)
  .suscribir(new ObservadorAlertaStockBajo(alertas))
  .suscribir(new ObservadorInvalidarCache(cache));
const estrategias = new RegistroEstrategias();
const deps = { uow, publicador, estrategias };
const v = (n, i) => verificarPuerto(PUERTOS_ENTRADA, n, i);

const casosDeUso = {
  disponibilidad: v('ConsultarDisponibilidad', new ConsultarDisponibilidad({ disponibilidad })),
  reservar: v('ReservarStock', new ReservarStock({ ...deps, ttlMinutos: config.reservaTtlMinutos })),
  liberar: v('LiberarReserva', new LiberarReserva(deps)),
  liquidar: v('LiquidarReserva', new LiquidarReserva(deps)),
  movimiento: v('RegistrarMovimiento', new RegistrarMovimiento(deps)),
  historial: v('ConsultarHistorial', new ConsultarHistorial({ historial })),
  minimo: v('ConfigurarStockMinimo', new ConfigurarStockMinimo(deps)),
  alertas: v('ConsultarAlertas', new ConsultarAlertas({ alertas })),
};
const expirar = v('ExpirarReservasVencidas', new ExpirarReservasVencidas(deps));
const sincronizar = v('SincronizarCicloVidaProducto', new SincronizarCicloVidaProducto({ uow }));

// Worker de expiración (ADR-015)
let ocupado = false;
const timerExpiracion = setInterval(async () => {
  if (ocupado) return; ocupado = true;
  try { const n = await expirar.ejecutar(); if (n) logger.info({ reservas: n }, 'reservas vencidas liberadas'); }
  catch (error) { logger.error({ error }, 'fallo del worker de expiración'); }
  finally { ocupado = false; }
}, config.expiracionIntervaloMs);

// Mensajería (opcional si no hay RABBITMQ_URL)
let relay, pub, consumidor;
if (config.rabbitUrl) {
  pub = new RabbitPublicador({ url: config.rabbitUrl, exchange: 'inventory.integration.v1', log: logger });
  await pub.conectar();
  relay = new OutboxRelay({ pool, publicador: pub, log: logger, intervaloMs: config.outboxIntervaloMs });
  relay.iniciar();
  consumidor = new ConsumidorProductos({ url: config.rabbitUrl, sincronizar, log: logger, maxIntentos: config.maxReintentosEvento, retardoMs: config.reintentoEventoMs });
  await consumidor.iniciar();
} else logger.warn('RABBITMQ_URL no definido: no se consumen eventos de Productos ni se publica la Outbox');

const app = crearApp({
  casosDeUso, log: logger,
  secretos: { user: config.jwtSecret, service: config.internalJwtSecret },
  verificarSalud: async () => { await pool.query('SELECT 1'); },
});
const server = app.listen(config.port, () => logger.info({ port: config.port }, 'ms-inventario listo'));

const apagar = async () => {
  logger.info('apagando...');
  server.close(); clearInterval(timerExpiracion); relay?.detener(); await consumidor?.cerrar(); await pub?.cerrar(); redis.disconnect(); await pool.end(); process.exit(0);
};
process.on('SIGTERM', apagar); process.on('SIGINT', apagar);
