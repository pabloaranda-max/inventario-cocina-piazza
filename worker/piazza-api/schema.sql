CREATE TABLE IF NOT EXISTS usuarios (
  email TEXT PRIMARY KEY,
  nombre TEXT,
  rol TEXT DEFAULT 'usuario'
);

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  contacto TEXT,
  tel TEXT,
  email TEXT,
  rfc TEXT,
  dir TEXT,
  dias TEXT,
  mapsUrl TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  tipo TEXT DEFAULT 'cliente',
  estatus_prospecto TEXT DEFAULT '',
  interes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS productos (
  id TEXT PRIMARY KEY,
  nombre TEXT,
  cat TEXT,
  unidad TEXT,
  precio TEXT,
  disponible TEXT DEFAULT 'true'
);

CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  clienteId TEXT,
  items TEXT,
  resumen TEXT,
  fechaPedido TEXT,
  mes TEXT,
  fecha TEXT,
  estado TEXT DEFAULT 'pendiente',
  pago TEXT DEFAULT '',
  factura TEXT DEFAULT '',
  notas TEXT DEFAULT ''
);
