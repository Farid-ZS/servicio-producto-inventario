# ms-inventario — Gestión de Inventario (arquitectura HEXAGONAL, ADR-031)

```
src/
├── domain/                 Stock, Reserva, estrategias de movimiento (Strategy), errores — reglas puras
├── application/            Casos de uso (puertos de entrada), puertos de salida (puertos.js), idempotencia, observadores (Observer)
├── adapters/in/            http/ (REST) · messaging/ (consumidor RabbitMQ de ciclo de vida de producto) [+ worker de expiración en main.js]
├── adapters/out/           postgres/ (unidad de trabajo, repos, outbox-relay) · redis/ (Proxy) · messaging/ (publicador)
├── config/ · main.js       raíz de composición (cablea adaptadores a puertos)
migrations/ seeds/ scripts/ test/
```
Tres entradas (REST, worker de expiración, eventos) y tres salidas (PostgreSQL, Redis, RabbitMQ) justifican el hexágono: el núcleo se prueba sin infraestructura (`test/support/memoria.js`).

## Flujo de punta a punta implementado: CU-INV-01 Consulta y reserva temporal de stock
`GET /inventory/availability` → `POST /inventory/movements` (ENTRADA; SALIDA/AJUSTE no dejan stock negativo ni invaden reservado, ADR-027) → `POST /inventory/reservations` (todo-o-nada, `FOR UPDATE` ordenado, `Idempotency-Key`, ADR-007/023) → `liquidate` (movimiento VENTA) → `GET /inventory/movements`. Además: `release`, expiración (`SKIP LOCKED`, ADR-015), alertas de stock mínimo.
- Dónde: `adapters/in/http/app.js`, `application/casos-de-uso/{reservar-stock,liquidar-reserva,registrar-movimiento}.js`, `domain/stock.js`.
- Ejecutar: ver README raíz. Tests: `npm test` (18).
- Evidencia: `../docs/evidencia-tests-inventario.txt`, `../docs/evidencia-migraciones-seeds.txt`.
