# ms-productos — Gestión de Productos (arquitectura en CAPAS, ADR-030)

```
src/
├── api/             Capa API: rutas Express, autenticación JWT, RBAC, formato de error (app.js, middlewares.js)
├── application/     Casos de uso + interfaces (repositorios/clientes) que la infraestructura implementa
├── domain/          Producto, Categoría, código PRD-XXXXXXXX, eventos, errores (sin dependencias externas)
├── infrastructure/  postgres/ (repos, migrar, outbox-relay) · redis/ (Proxy de caché) · http/ (InventarioClient, 1 s) · auth/ · messaging/ (RabbitMQ)
├── config/ · shared/ · main.js (raíz de composición)
migrations/ seeds/ scripts/ test/
```
Dependencias solo hacia abajo; la capa de Aplicación declara las interfaces (inversión de dependencias en la frontera de infraestructura).

## Flujo de punta a punta implementado: CU-PRO-02 Consulta/búsqueda del catálogo (+ registro y estado)
`POST /categories` → `POST /products` (código único con reintento, ADR-016; evento `ProductoCreado` por Outbox) → `GET /products?q=` (datos desde Redis/PG + disponibilidad por lote desde Inventario; si Inventario falla no se muestra disponible, ADR-003) → `deactivate/activate`.
- Dónde: `api/app.js`, `application/casos-de-uso/{registrar-producto,consultar-catalogo,cambiar-estado-producto}.js`, `infrastructure/http/inventario-client.js`.
- Ejecutar: ver README raíz (`docker compose up`, `npm run seed`, `node scripts/e2e.mjs`). Tests: `npm test` (11).
- Evidencia: `../docs/evidencia-tests-productos.txt`, `../docs/evidencia-migraciones-seeds.txt`.
