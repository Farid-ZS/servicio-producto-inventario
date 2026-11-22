# Servicio de Productos

Gestión de Productos del sistema ERP por WhatsApp. Arquitectura en capas (ADR-030).

## Estructura

```text
src/
├── api/              Rutas REST, autenticación JWT, control de acceso por rol y formato de error
├── application/      Casos de uso e interfaces de repositorios y clientes
├── domain/           Producto, categoría, código único y eventos
├── infrastructure/   postgres/ · redis/ · http/ · auth/ · messaging/
├── config/
└── main.js           Composición de dependencias
migrations/  seeds/  scripts/  test/
```

Las dependencias fluyen hacia abajo entre capas. La capa de Aplicación declara las interfaces que la capa de Infraestructura implementa.

## Flujo implementado

Registro, consulta y búsqueda del catálogo (RF-PRO-01 a RF-PRO-07):

1. Creación de categoría, con validación de jerarquía sin ciclos.
2. Registro de producto con código único `PRD-XXXXXXXX`, con reintento ante colisión. El evento `ProductoCreado` se guarda en la tabla `outbox` dentro de la misma transacción.
3. Búsqueda por texto, categoría y estado, con la disponibilidad obtenida de Inventario mediante una consulta por lote (timeout de 1 s, sin reintentos). Si Inventario no responde, ningún producto se presenta como disponible.
4. Activación y desactivación de productos.

## Ubicación en el código

| Elemento | Ruta |
|---|---|
| Rutas REST | `src/api/app.js` |
| Autenticación y autorización | `src/api/middlewares.js` |
| Casos de uso | `src/application/casos-de-uso/` |
| Reglas de dominio | `src/domain/` |
| Caché (patrón Proxy) | `src/infrastructure/redis/repositorio-productos-con-cache.js` |
| Cliente de disponibilidad | `src/infrastructure/http/inventario-client.js` |

## Ejecución

Las instrucciones de ejecución, poblamiento y pruebas se encuentran en el [README del repositorio](../README.md).

```bash
npm install
npm test            # 11 pruebas
npm run migrate
npm run seed
npm start
```

## Evidencia

- `../docs/evidencia-tests-productos.txt`
- `../docs/evidencia-migraciones-seeds.txt`