import Redis from 'ioredis';
import { config } from './config/config.js';
import { logger } from './shared/logger.js';
import { generarCodigoProducto } from './domain/codigo.js';
import { SERVICIOS_APLICACION, INTERFACES_INFRA, verificarInterfaz } from './application/interfaces.js';
import { GestionarCategorias } from './application/casos-de-uso/gestionar-categorias.js';
import { RegistrarProducto } from './application/casos-de-uso/registrar-producto.js';
import { ModificarProducto } from './application/casos-de-uso/modificar-producto.js';
import { CambiarEstadoProducto } from './application/casos-de-uso/cambiar-estado-producto.js';
import { ConsultarCatalogo } from './application/casos-de-uso/consultar-catalogo.js';
import { crearPool } from './infrastructure/postgres/pool.js';
import { migrar } from './infrastructure/postgres/migrar.js';
import { RepositorioProductosPg } from './infrastructure/postgres/repositorio-productos-pg.js';
import { RepositorioCategoriasPg } from './infrastructure/postgres/repositorio-categorias-pg.js';
import { OutboxRelay } from './infrastructure/postgres/outbox-relay.js';
import { RepositorioProductosConCache } from './infrastructure/redis/repositorio-productos-con-cache.js';
import { InventarioClient } from './infrastructure/http/inventario-client.js';
import { FirmanteTokenServicio } from './infrastructure/auth/firmante-token-servicio.js';
import { RabbitPublicador } from './infrastructure/messaging/rabbit-publicador.js';
import { crearApp } from './api/app.js';

// ---------- Raíz de composición: único lugar que conoce adaptadores concretos ----------
const pool = crearPool(config.databaseUrl);
await migrar(pool, logger);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
redis.on('error', (error) => logger.error({ error }, 'Redis'));

const productos = verificarInterfaz(INTERFACES_INFRA, 'RepositorioProductos',
  new RepositorioProductosConCache({ real: new RepositorioProductosPg(pool), redis, ttlSeg: config.ttlProductoSeg }));
const categorias = verificarInterfaz(INTERFACES_INFRA, 'RepositorioCategorias', new RepositorioCategoriasPg(pool));
const disponibilidad = verificarInterfaz(INTERFACES_INFRA, 'ServicioDisponibilidad', new InventarioClient({
  baseUrl: config.inventarioUrl, timeoutMs: config.inventarioTimeoutMs,
  firmante: new FirmanteTokenServicio({ secreto: config.internalJwtSecret }),
}));

const casosDeUso = {
  categorias: verificarInterfaz(SERVICIOS_APLICACION, 'GestionarCategorias', new GestionarCategorias({ categorias, productos })),
  registrar: verificarInterfaz(SERVICIOS_APLICACION, 'RegistrarProducto', new RegistrarProducto({ productos, categorias, generarCodigo: generarCodigoProducto, maxReintentos: config.maxReintentosCodigo })),
  modificar: verificarInterfaz(SERVICIOS_APLICACION, 'ModificarProducto', new ModificarProducto({ productos, categorias })),
  estado: verificarInterfaz(SERVICIOS_APLICACION, 'CambiarEstadoProducto', new CambiarEstadoProducto({ productos })),
  catalogo: verificarInterfaz(SERVICIOS_APLICACION, 'ConsultarCatalogo', new ConsultarCatalogo({ productos, disponibilidad })),
};

let relay; let publicador;
if (config.rabbitUrl) {
  publicador = new RabbitPublicador({ url: config.rabbitUrl, exchange: 'products.integration.v1', log: logger });
  await publicador.conectar();
  relay = new OutboxRelay({ pool, publicador, log: logger, intervaloMs: config.outboxIntervaloMs });
  relay.iniciar();
} else logger.warn('RABBITMQ_URL no definido: la Outbox acumula eventos sin publicarlos');

const app = crearApp({
  casosDeUso, log: logger,
  secretos: { user: config.jwtSecret, service: config.internalJwtSecret },
  verificarSalud: async () => { await pool.query('SELECT 1'); },
});
const server = app.listen(config.port, () => logger.info({ port: config.port }, 'ms-productos listo'));

const apagar = async () => {
  logger.info('apagando...');
  server.close(); relay?.detener(); await publicador?.cerrar(); redis.disconnect(); await pool.end(); process.exit(0);
};
process.on('SIGTERM', apagar); process.on('SIGINT', apagar);
