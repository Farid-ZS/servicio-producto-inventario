# Servicio de Inventario

Gestión de Inventario del sistema ERP por WhatsApp. Arquitectura hexagonal (ADR-031).

## Estructura

```text
src/
├── domain/                  Stock, reserva y estrategias de movimiento
├── application/             Casos de uso, puertos, idempotencia y observadores
├── adapters/
│   ├── in/                  http/ (REST) · messaging/ (consumidor de eventos de productos)
│   └── out/                 postgres/ · redis/ · messaging/
├── config/
└── main.js                  Composición de dependencias
migrations/  seeds/  scripts/  test/
```

El núcleo (dominio y aplicación) no depende de la infraestructura y se prueba con repositorios en memoria. El servicio cuenta con tres entradas (REST, tarea de expiración y eventos) y tres salidas (PostgreSQL, Redis y RabbitMQ).

## Flujo implementado

Consulta y reserva temporal de stock (RF-INV-01 a RF-INV-13):

1. Consulta de disponibilidad por lote (stock físico menos reservado).
2. Registro de movimientos de entrada, salida y ajuste, sin permitir stock negativo ni afectar unidades reservadas.
3. Reserva atómica de todas las líneas del pedido, con bloqueo de filas e `Idempotency-Key`.
4. Liquidación de la reserva como movimiento de venta, o liberación por cancelación.
5. Expiración automática de reservas vencidas.
6. Consulta del historial de movimientos y de alertas de stock mínimo.

## Ubicación en el código

| Elemento | Ruta |
|---|---|
| Rutas REST | `src/adapters/in/http/app.js` |
| Reserva de stock | `src/application/casos-de-uso/reservar-stock.js` |
| Movimientos | `src/application/casos-de-uso/registrar-movimiento.js` |
| Patrón Strategy | `src/domain/estrategias/estrategias.js` |
| Patrón Observer | `src/application/observadores/publicador-cambio-stock.js` |
| Caché (patrón Proxy) | `src/adapters/out/redis/repositorio-disponibilidad-con-cache.js` |
| Consumidor de eventos | `src/adapters/in/messaging/consumidor-productos.js` |

## Ejecución

Las instrucciones de ejecución, poblamiento y pruebas se encuentran en el [README del repositorio](../README.md).

```bash
npm install
npm test            # 18 pruebas
npm run migrate
npm run seed
npm start
```

## Evidencia

- `../docs/evidencia-tests-inventario.txt`
- `../docs/evidencia-migraciones-seeds.txt`