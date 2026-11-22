-- db_operaciones (ADR-008 / ADR-010): sin FKs hacia db_core; producto_id y pedido_id son referencias lógicas.
CREATE TABLE stock (
  producto_id UUID PRIMARY KEY,
  stock_fisico INTEGER NOT NULL DEFAULT 0 CHECK (stock_fisico >= 0),
  stock_reservado INTEGER NOT NULL DEFAULT 0 CHECK (stock_reservado >= 0),
  stock_minimo INTEGER CHECK (stock_minimo IS NULL OR stock_minimo >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  -- Extensión al modelo 12.2 (ADR-025): ProductoActivado/Desactivado habilitan o impiden NUEVAS reservas.
  producto_activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT stock_reservado_le_fisico CHECK (stock_reservado <= stock_fisico)
);

CREATE TABLE reservas (
  id UUID PRIMARY KEY,
  pedido_id UUID NOT NULL,
  producto_id UUID NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  estado TEXT NOT NULL CHECK (estado IN ('ACTIVA','LIBERADA','EXPIRADA','LIQUIDADA')),
  vence_en TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_reservas_pedido_estado ON reservas(pedido_id, estado);
CREATE INDEX idx_reservas_vence_activas ON reservas(vence_en) WHERE estado = 'ACTIVA';
CREATE INDEX idx_reservas_producto_estado ON reservas(producto_id, estado);

-- Historial append-only (ADR-005)
CREATE TABLE movimientos_inventario (
  id UUID PRIMARY KEY,
  producto_id UUID NOT NULL,
  pedido_id UUID,
  tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE','VENTA')),
  cantidad INTEGER NOT NULL CHECK (cantidad <> 0),
  motivo TEXT,
  usuario_id UUID NOT NULL,
  fecha TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_movimientos_producto_tipo_fecha ON movimientos_inventario(producto_id, tipo, fecha);
CREATE FUNCTION bloquear_mutacion_movimientos() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'movimientos_inventario es append-only'; END $$;
CREATE TRIGGER trg_movimientos_append_only BEFORE UPDATE OR DELETE ON movimientos_inventario
  FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion_movimientos();

-- Idempotencia de reserve/release/liquidate (ADR-023): se conserva 24 h
CREATE TABLE idempotencia (
  clave TEXT PRIMARY KEY,
  operacion TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  resultado JSONB NOT NULL,
  creada_en TIMESTAMPTZ NOT NULL
);

-- Alertas de stock bajo (CU-INV-07)
CREATE TABLE alertas_stock (
  producto_id UUID PRIMARY KEY,
  stock_disponible INTEGER NOT NULL,
  stock_minimo INTEGER NOT NULL,
  actualizada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactional Outbox (ADR-024): ReservaExpirada
CREATE TABLE outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  version INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ
);
CREATE INDEX idx_outbox_pendientes ON outbox(id) WHERE published_at IS NULL;
