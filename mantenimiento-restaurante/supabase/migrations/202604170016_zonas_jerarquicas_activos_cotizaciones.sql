-- Base para mapa operativo jerarquico:
-- - zonas/subzonas con geometria editable
-- - activos ligados a la zona mas especifica
-- - cotizaciones ligadas directamente a activo
-- - snapshot de zona en incidencias/mantenimientos para preservar historial

alter table mapa_zonas
  add column if not exists parent_id uuid references mapa_zonas(id) on delete set null,
  add column if not exists nombre text,
  add column if not exists tipo text not null default 'zona',
  add column if not exists geometry_tipo text not null default 'point',
  add column if not exists geometry jsonb,
  add column if not exists color text,
  add column if not exists descripcion text;
update mapa_zonas
set
  nombre = coalesce(nombre, nullif(label, ''), area),
  geometry = coalesce(
    geometry,
    jsonb_build_object('x', x, 'y', y)
  )
where nombre is null or geometry is null;
alter table mapa_zonas
  alter column nombre set not null,
  add constraint mapa_zonas_tipo_check check (tipo in ('zona', 'subzona')),
  add constraint mapa_zonas_geometry_tipo_check check (geometry_tipo in ('point', 'rect', 'polygon'));
create index if not exists idx_mapa_zonas_parent_id on mapa_zonas(parent_id);
create index if not exists idx_mapa_zonas_tipo on mapa_zonas(tipo);
alter table activos
  add column if not exists zona_id uuid references mapa_zonas(id) on delete set null;
alter table incidencias
  add column if not exists zona_id uuid references mapa_zonas(id) on delete set null,
  add column if not exists zona_nombre text;
alter table mantenimientos
  add column if not exists zona_id uuid references mapa_zonas(id) on delete set null,
  add column if not exists zona_nombre text;
alter table cotizaciones
  add column if not exists activo_id uuid references activos(id) on delete set null;
create index if not exists idx_activos_zona_id on activos(zona_id);
create index if not exists idx_incidencias_zona_id on incidencias(zona_id);
create index if not exists idx_mantenimientos_zona_id on mantenimientos(zona_id);
create index if not exists idx_cotizaciones_activo_id on cotizaciones(activo_id);
-- Backfill conservador: si el area del activo coincide exactamente con una zona,
-- ligamos el activo a esa zona. Si hay duplicados, tomamos la primera por orden.
with zona_por_area as (
  select distinct on (area) id, area, nombre
  from mapa_zonas
  where visible = true
  order by area, orden asc, created_at asc
)
update activos a
set zona_id = z.id
from zona_por_area z
where a.zona_id is null
  and a.area = z.area;
-- Backfill de cotizaciones: inferimos activo desde incidencia o mantenimiento
-- cuando existe una relacion clara.
update cotizaciones c
set activo_id = i.activo_id
from incidencias i
where c.activo_id is null
  and c.incidencia_id = i.id
  and i.activo_id is not null;
update cotizaciones c
set activo_id = m.activo_id
from mantenimientos m
where c.activo_id is null
  and c.mantenimiento_id = m.id
  and m.activo_id is not null;
-- Snapshot inicial de zona para eventos historicos.
update incidencias i
set
  zona_id = a.zona_id,
  zona_nombre = z.nombre
from activos a
left join mapa_zonas z on z.id = a.zona_id
where i.zona_id is null
  and i.activo_id = a.id;
update mantenimientos m
set
  zona_id = a.zona_id,
  zona_nombre = z.nombre
from activos a
left join mapa_zonas z on z.id = a.zona_id
where m.zona_id is null
  and m.activo_id = a.id;
