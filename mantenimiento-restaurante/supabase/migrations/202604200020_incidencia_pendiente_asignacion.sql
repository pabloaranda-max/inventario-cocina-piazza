-- Agrega estado pendiente_asignacion al enum de incidencias.
-- Los reportes nuevos nacen aquí y solo pasan a 'abierta' cuando el admin los revisa y asigna.
-- ALTER TYPE ADD VALUE no puede correr dentro de una transacción explícita en Postgres < 12.
-- En Supabase (Postgres 15) sí funciona con IF NOT EXISTS.
ALTER TYPE estado_incidencia ADD VALUE IF NOT EXISTS 'pendiente_asignacion' BEFORE 'abierta';
