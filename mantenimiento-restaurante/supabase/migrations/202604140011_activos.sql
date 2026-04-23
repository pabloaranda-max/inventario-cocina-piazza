create table if not exists activos (
  id uuid primary key default gen_random_uuid(),
  clase text not null check (clase in ('equipo', 'infraestructura', 'mobiliario', 'edificacion', 'sistema')),
  nombre text not null,
  tipo text not null,
  sistema text,
  area text,
  estado text not null default 'operativo' check (
    estado in (
      'operativo',
      'pendiente_revision',
      'en_reparacion',
      'requiere_revision',
      'obstruido',
      'con_fuga',
      'sin_acceso',
      'fuera_de_servicio'
    )
  ),
  criticidad text not null default 'media' check (criticidad in ('baja', 'media', 'alta', 'critica')),
  proveedor_id uuid references proveedores(id) on delete set null,
  nivel_id uuid references mapa_niveles(id) on delete set null,
  x numeric(6, 3),
  y numeric(6, 3),
  foto_url text,
  notas text,
  fecha_ultima_revision date,
  fecha_proxima_revision date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activos_mapa_coords_check check (
    (nivel_id is null and x is null and y is null)
    or (nivel_id is not null and x is not null and y is not null and x >= 0 and x <= 100 and y >= 0 and y <= 100)
  )
);
create table if not exists equipos_detalle (
  activo_id uuid primary key references activos(id) on delete cascade,
  categoria text,
  marca text,
  modelo text,
  numero_serie text,
  foto_placa_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists infraestructura_detalle (
  activo_id uuid primary key references activos(id) on delete cascade,
  descripcion_ubicacion text,
  acceso text,
  plano_referencia text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into activos (
  id,
  clase,
  nombre,
  tipo,
  sistema,
  area,
  estado,
  criticidad,
  proveedor_id,
  foto_url,
  notas,
  fecha_ultima_revision,
  fecha_proxima_revision,
  created_at,
  updated_at
)
select
  id,
  'equipo',
  nombre,
  coalesce(nullif(categoria, ''), 'Equipo'),
  null,
  area,
  estado::text,
  'media',
  proveedor_id,
  foto_url,
  notas,
  fecha_ultimo_mantenimiento,
  fecha_proximo_mantenimiento,
  created_at,
  updated_at
from equipos
on conflict (id) do update
set clase = excluded.clase,
    nombre = excluded.nombre,
    tipo = excluded.tipo,
    area = excluded.area,
    estado = excluded.estado,
    proveedor_id = excluded.proveedor_id,
    foto_url = excluded.foto_url,
    notas = excluded.notas,
    fecha_ultima_revision = excluded.fecha_ultima_revision,
    fecha_proxima_revision = excluded.fecha_proxima_revision,
    updated_at = excluded.updated_at;
insert into equipos_detalle (
  activo_id,
  categoria,
  marca,
  modelo,
  numero_serie,
  foto_placa_url,
  created_at,
  updated_at
)
select
  id,
  categoria,
  marca,
  modelo,
  numero_serie,
  foto_placa_url,
  created_at,
  updated_at
from equipos
on conflict (activo_id) do update
set categoria = excluded.categoria,
    marca = excluded.marca,
    modelo = excluded.modelo,
    numero_serie = excluded.numero_serie,
    foto_placa_url = excluded.foto_placa_url,
    updated_at = excluded.updated_at;
insert into activos (
  id,
  clase,
  nombre,
  tipo,
  sistema,
  area,
  estado,
  criticidad,
  proveedor_id,
  nivel_id,
  x,
  y,
  foto_url,
  notas,
  fecha_ultima_revision,
  fecha_proxima_revision,
  created_at,
  updated_at
)
select
  id,
  'infraestructura',
  nombre,
  tipo,
  null,
  area,
  estado,
  criticidad,
  proveedor_id,
  nivel_id,
  x,
  y,
  foto_url,
  notas,
  fecha_ultima_revision,
  fecha_proxima_revision,
  created_at,
  updated_at
from infraestructura
on conflict (id) do update
set clase = excluded.clase,
    nombre = excluded.nombre,
    tipo = excluded.tipo,
    area = excluded.area,
    estado = excluded.estado,
    criticidad = excluded.criticidad,
    proveedor_id = excluded.proveedor_id,
    nivel_id = excluded.nivel_id,
    x = excluded.x,
    y = excluded.y,
    foto_url = excluded.foto_url,
    notas = excluded.notas,
    fecha_ultima_revision = excluded.fecha_ultima_revision,
    fecha_proxima_revision = excluded.fecha_proxima_revision,
    updated_at = excluded.updated_at;
insert into infraestructura_detalle (
  activo_id,
  descripcion_ubicacion,
  created_at,
  updated_at
)
select
  id,
  descripcion_ubicacion,
  created_at,
  updated_at
from infraestructura
on conflict (activo_id) do update
set descripcion_ubicacion = excluded.descripcion_ubicacion,
    updated_at = excluded.updated_at;
alter table incidencias
  add column if not exists activo_id uuid references activos(id) on delete set null;
alter table mantenimientos
  add column if not exists activo_id uuid references activos(id) on delete set null;
update incidencias
set activo_id = coalesce(equipo_id, infraestructura_id)
where activo_id is null
  and coalesce(equipo_id, infraestructura_id) is not null;
update mantenimientos
set activo_id = coalesce(equipo_id, infraestructura_id)
where activo_id is null
  and coalesce(equipo_id, infraestructura_id) is not null;
create index if not exists idx_activos_clase on activos(clase);
create index if not exists idx_activos_area on activos(area);
create index if not exists idx_activos_estado on activos(estado);
create index if not exists idx_activos_sistema on activos(sistema);
create index if not exists idx_activos_nivel_id on activos(nivel_id);
create index if not exists idx_activos_proveedor_id on activos(proveedor_id);
create index if not exists idx_incidencias_activo_id on incidencias(activo_id);
create index if not exists idx_mantenimientos_activo_id on mantenimientos(activo_id);
drop trigger if exists set_activos_updated_at on activos;
create trigger set_activos_updated_at
before update on activos
for each row execute function set_updated_at();
drop trigger if exists set_equipos_detalle_updated_at on equipos_detalle;
create trigger set_equipos_detalle_updated_at
before update on equipos_detalle
for each row execute function set_updated_at();
drop trigger if exists set_infraestructura_detalle_updated_at on infraestructura_detalle;
create trigger set_infraestructura_detalle_updated_at
before update on infraestructura_detalle
for each row execute function set_updated_at();
alter table activos enable row level security;
alter table equipos_detalle enable row level security;
alter table infraestructura_detalle enable row level security;
drop policy if exists "Usuarios autenticados gestionan activos" on activos;
create policy "Usuarios autenticados gestionan activos"
on activos for all
to authenticated
using (true)
with check (true);
drop policy if exists "Usuarios autenticados gestionan equipos_detalle" on equipos_detalle;
create policy "Usuarios autenticados gestionan equipos_detalle"
on equipos_detalle for all
to authenticated
using (true)
with check (true);
drop policy if exists "Usuarios autenticados gestionan infraestructura_detalle" on infraestructura_detalle;
create policy "Usuarios autenticados gestionan infraestructura_detalle"
on infraestructura_detalle for all
to authenticated
using (true)
with check (true);
