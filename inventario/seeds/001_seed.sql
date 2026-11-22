-- Poblamiento db_operaciones (idempotente). Mismos productId que productos/seeds/001_seed.sql.
INSERT INTO stock(producto_id,stock_fisico,stock_reservado,stock_minimo,version,producto_activo) VALUES
 ('a0000000-0000-4000-8000-000000000001',50,0,10,1,true),
 ('a0000000-0000-4000-8000-000000000002',200,0,30,1,true),
 ('a0000000-0000-4000-8000-000000000003',8,0,10,1,true),   -- bajo el mínimo: genera alerta
 ('a0000000-0000-4000-8000-000000000004',20,0,NULL,1,true),
 ('a0000000-0000-4000-8000-000000000005',0,0,NULL,1,false)
ON CONFLICT (producto_id) DO NOTHING;
INSERT INTO movimientos_inventario(id,producto_id,tipo,cantidad,motivo,usuario_id,fecha)
SELECT gen_random_uuid(), producto_id,'ENTRADA',stock_fisico,'Carga inicial (seed)','b0000000-0000-4000-8000-000000000001',now()
FROM stock s WHERE stock_fisico>0 AND NOT EXISTS (SELECT 1 FROM movimientos_inventario m WHERE m.producto_id=s.producto_id);
INSERT INTO alertas_stock(producto_id,stock_disponible,stock_minimo) VALUES ('a0000000-0000-4000-8000-000000000003',8,10)
ON CONFLICT (producto_id) DO NOTHING;
