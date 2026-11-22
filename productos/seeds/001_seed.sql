-- Poblamiento db_core (idempotente). UUIDs fijos compartidos con inventario/seeds para que los datos coincidan entre servicios.
INSERT INTO categorias(id,nombre,descripcion,estado,categoria_padre_id) VALUES
 ('c0000000-0000-4000-8000-000000000001','Electrónica','Dispositivos y accesorios','ACTIVA',NULL),
 ('c0000000-0000-4000-8000-000000000002','Celulares','Smartphones','ACTIVA','c0000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000003','Accesorios','Cargadores, fundas','ACTIVA','c0000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000004','Hogar','Artículos para el hogar','ACTIVA',NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO productos(id,codigo,nombre,descripcion,precio_venta,estado,categoria_id,version) VALUES
 ('a0000000-0000-4000-8000-000000000001','PRD-A1B2C3D4','Smartphone X1','6.5" 128GB',999.00,'ACTIVO','c0000000-0000-4000-8000-000000000002',1),
 ('a0000000-0000-4000-8000-000000000002','PRD-E5F6A7B8','Cargador rápido 30W','USB-C',59.90,'ACTIVO','c0000000-0000-4000-8000-000000000003',1),
 ('a0000000-0000-4000-8000-000000000003','PRD-C9D0E1F2','Funda protectora','Silicona',19.90,'ACTIVO','c0000000-0000-4000-8000-000000000003',1),
 ('a0000000-0000-4000-8000-000000000004','PRD-13243546','Licuadora 600W','Vaso de vidrio',149.00,'ACTIVO','c0000000-0000-4000-8000-000000000004',1),
 ('a0000000-0000-4000-8000-000000000005','PRD-57687980','Smartphone X0 (descontinuado)','Modelo anterior',499.00,'INACTIVO','c0000000-0000-4000-8000-000000000002',2)
ON CONFLICT (id) DO NOTHING;
-- Eventos ProductoCreado ya publicados (Inventario se siembra directamente), para que el relay no los reenvíe.
INSERT INTO outbox(event_id,event_type,aggregate_id,version,occurred_at,payload,published_at)
SELECT gen_random_uuid(),'ProductoCreado',id,1,now(),jsonb_build_object('productId',id,'codigo',codigo,'estado',estado),now()
FROM productos p WHERE NOT EXISTS (SELECT 1 FROM outbox o WHERE o.aggregate_id=p.id);
