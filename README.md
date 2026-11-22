# ERP por WhatsApp — Módulo 2: Gestión de Productos + Gestión de Inventario (ZAMUDIO)

Grupo `diseno262-grupo1`

| Servicio | Puerto | Arquitectura (ADR) | Código | BD |
|---|---|---|---|---|
| Productos | 3001 | **Capas** (API → Aplicación → Dominio → Infraestructura) — ADR-030 (local) / 069 (consolidado) | `productos/` | `db_core` |
| Inventario | 3002 | **Hexagonal** (puertos y adaptadores) — ADR-031 (local) / 070 (consolidado) | `inventario/` | `db_operaciones` |

## Prerrequisitos
Node.js ≥ 20 · Docker + Docker Compose (recomendado) · o PostgreSQL 16, Redis 7 y RabbitMQ 3 instalados localmente.

## Stack
Node.js 20 LTS, Express 4, JavaScript ESM, `pg`, `ioredis`, `amqplib`, `jsonwebtoken`, `node:test`, Docker. PostgreSQL 16 (una BD por servicio, ADR-008), Redis (caché Proxy, ADR-011/028), RabbitMQ (Transactional Outbox, ADR-024). Sin frontend: el frontend es común del grupo; estos servicios exponen REST detrás del API Gateway.

## Levantar el sistema
```bash
docker compose up --build                     # BD, Redis, RabbitMQ y ambos servicios (migran solos al arrancar)
# Poblamiento (datos de prueba con UUID compartidos entre servicios):
cd productos  && npm install && DATABASE_URL=postgres://postgres:postgres@localhost:5432/db_core        npm run seed
cd ../inventario && npm install && DATABASE_URL=postgres://postgres:postgres@localhost:5433/db_operaciones npm run seed
# Flujo de punta a punta (ambos servicios arriba):
cd .. && node scripts/e2e.mjs
# Pruebas unitarias/de caso de uso (no requieren BD):
(cd productos && npm test) && (cd inventario && npm test)
```
Token de prueba: `node scripts/token.mjs ADMINISTRADOR` (roles: ADMINISTRADOR, VENDEDOR, ALMACENERO, SERVICE_PEDIDOS, SERVICE_PRODUCTOS; `... service` firma con el secreto interno).

## Migraciones, esquemas y seeds
| Qué | Dónde |
|---|---|
| Esquema Productos (categorías, productos, índices GIN/trgm, outbox) | `productos/migrations/001_init.sql` |
| Esquema Inventario (stock, reservas, movimientos append-only, idempotencia, alertas, outbox) | `inventario/migrations/001_init.sql` |
| Ejecutar migraciones | `npm run migrate` (versionadas en `schema_migrations`, con advisory lock) |
| Poblamiento | `productos/seeds/001_seed.sql`, `inventario/seeds/001_seed.sql` · `npm run seed` (idempotente) |

## Patrones GoF: previsto → aplicado
| Patrón | Estado | Servicio | Dónde |
|---|---|---|---|
| Strategy | **Aplicado** | Inventario | `inventario/src/domain/estrategias/estrategias.js` (+ `registrar-movimiento.js`) |
| Observer | **Aplicado** | Inventario | `inventario/src/application/observadores/publicador-cambio-stock.js` |
| Proxy (caché) | **Aplicado** | Ambos | `productos/src/infrastructure/redis/repositorio-productos-con-cache.js`, `inventario/src/adapters/out/redis/repositorio-disponibilidad-con-cache.js` |

## Evidencia (en `docs/`)
- `evidencia-tests-productos.txt` (11/11) y `evidencia-tests-inventario.txt` (18/18).
- `evidencia-migraciones-seeds.txt`: migraciones y seeds ejecutados sobre PostgreSQL 16 (idempotentes; el trigger append-only rechaza UPDATE de movimientos).
- Flujo HTTP completo: `node scripts/e2e.mjs` → adjuntar captura de la salida en la entrega.

## Contrato y decisiones
`docs/openapi.yaml` (OpenAPI 3.0.3). Extensiones propias al modelo 12.2: `productos.version` y `stock.producto_activo` (orden de eventos, ADR-025).
