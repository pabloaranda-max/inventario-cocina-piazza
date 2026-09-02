-- Agrega soporte para clientes potenciales (prospectos)
ALTER TABLE clientes ADD COLUMN tipo TEXT DEFAULT 'cliente';
ALTER TABLE clientes ADD COLUMN estatus_prospecto TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN interes TEXT DEFAULT '';
