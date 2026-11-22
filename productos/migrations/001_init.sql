-- db_core (ADR-008 / ADR-010): categorías, productos y outbox. Sin FKs hacia otras bases.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE categorias (
  id UUID PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('ACTIVA','INACTIVA')),
  categoria_padre_id UUID REFERENCES categorias(id)
);
CREATE INDEX idx_categorias_padre_id ON categorias(categoria_padre_id);

CREATE TABLE productos (
  id UUID PRIMARY KEY,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio_venta NUMERIC(12,2) NOT NULL CHECK (precio_venta >= 0),
  estado TEXT NOT NULL CHECK (estado IN ('ACTIVO','INACTIVO')),
  categoria_id UUID NOT NULL REFERENCES categorias(id),
  -- Extensión al modelo 12.2: versión del ciclo de vida para ordenar eventos (ADR-025).
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT productos_codigo_key UNIQUE (codigo)
);
CREATE INDEX idx_productos_categoria_estado ON productos(categoria_id, estado);
CREATE INDEX idx_productos_estado ON productos(estado);
CREATE INDEX idx_productos_nombre_trgm ON productos USING GIN (nombre gin_trgm_ops);

-- Transactional Outbox (ADR-024)
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
