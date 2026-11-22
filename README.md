# Servicio de Productos e Inventario

Módulo 2 del sistema ERP por WhatsApp: **Gestión de Productos** y **Gestión de Inventario**.

Repositorio: https://github.com/Farid-ZS/servicio-producto-inventario

## 1. Descripción general

El repositorio contiene dos microservicios independientes, cada uno con su propia base de datos:

| Servicio | Puerto | Arquitectura | Directorio | Base de datos |
|---|---|---|---|---|
| Productos | 3001 | En capas: API, Aplicación, Dominio e Infraestructura (ADR-030) | `productos/` | `db_core` |
| Inventario | 3002 | Hexagonal: puertos y adaptadores (ADR-031) | `inventario/` | `db_operaciones` |

La especificación de la API se encuentra en `docs/openapi.yaml` (OpenAPI 3.0.3).

## 2. Prerrequisitos

- Node.js 20 o superior.
- Docker y Docker Compose v2 (opción recomendada), o bien PostgreSQL 16, Redis 7 y RabbitMQ 3 instalados localmente.

## 3. Stack tecnológico

| Área | Tecnología |
|---|---|
| Backend | Node.js, Express 4, JavaScript (ESM) |
| Persistencia | PostgreSQL 16 (una base por servicio) |
| Caché | Redis 7 |
| Mensajería | RabbitMQ 3 (patrón Transactional Outbox) |
| Seguridad | JWT y control de acceso por rol (RBAC) |
| Pruebas | Node.js Test Runner |
| Contenedores | Docker y Docker Compose |

## 4. Estructura del repositorio

```text
.
├── productos/          Servicio de Productos (capas)
├── inventario/         Servicio de Inventario (hexagonal)
├── scripts/            token.mjs (tokens de prueba) y e2e.mjs (flujo de punta a punta)
├── docs/               openapi.yaml y evidencias de ejecución
├── docker-compose.yml
└── .env.example
```

Cada servicio contiene los directorios `src/`, `migrations/`, `seeds/`, `scripts/` y `test/`. Su estructura interna se describe en el README correspondiente.

## 5. Ejecución

### 5.1 Levantar los servicios

```bash
docker compose up --build
```

Los servicios aplican sus migraciones al iniciar.

### 5.2 Poblamiento de datos

```bash
cd productos && npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/db_core npm run seed

cd ../inventario && npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5433/db_operaciones npm run seed
```

### 5.3 Flujo de punta a punta

Con ambos servicios en ejecución y los datos cargados:

```bash
node scripts/e2e.mjs
```

### 5.4 Pruebas automatizadas

```bash
cd productos && npm test      # 11 pruebas
cd inventario && npm test     # 18 pruebas
```

Las pruebas no requieren base de datos.

### 5.5 Autenticación en las pruebas manuales

Las APIs exigen un token JWT. Para generarlo:

```bash
node scripts/token.mjs ADMINISTRADOR
```

Roles disponibles: `ADMINISTRADOR`, `VENDEDOR`, `ALMACENERO`, `SERVICE_PEDIDOS` y `SERVICE_PRODUCTOS`.

## 6. Migraciones y poblamiento

| Elemento | Ubicación |
|---|---|
| Esquema de Productos | `productos/migrations/001_init.sql` |
| Esquema de Inventario | `inventario/migrations/001_init.sql` |
| Ejecución de migraciones | `npm run migrate` (registro en `schema_migrations`) |
| Datos de prueba | `productos/seeds/001_seed.sql` e `inventario/seeds/001_seed.sql` |

Los scripts de poblamiento son repetibles: su ejecución múltiple no duplica datos.

## 7. Patrones de diseño aplicados

| Patrón | Servicio | Ubicación |
|---|---|---|
| Strategy | Inventario | `inventario/src/domain/estrategias/estrategias.js` |
| Observer | Inventario | `inventario/src/application/observadores/publicador-cambio-stock.js` |
| Proxy (caché) | Productos | `productos/src/infrastructure/redis/repositorio-productos-con-cache.js` |
| Proxy (caché) | Inventario | `inventario/src/adapters/out/redis/repositorio-disponibilidad-con-cache.js` |

## 8. Evidencia

Los resultados se encuentran en el directorio `docs/`:

- `evidencia-tests-productos.txt` y `evidencia-tests-inventario.txt`: resultados de las pruebas automatizadas.
- `evidencia-migraciones-seeds.txt`: ejecución de migraciones y poblamiento sobre PostgreSQL 16.

## 9. Decisiones de diseño

- El modelo de datos incorpora dos campos adicionales respecto al modelo 12.2: `productos.version` y `stock.producto_activo`, utilizados para ordenar los eventos de ciclo de vida del producto (ADR-025).
- El API Gateway y el frontend no forman parte de este alcance; los servicios validan el JWT directamente.