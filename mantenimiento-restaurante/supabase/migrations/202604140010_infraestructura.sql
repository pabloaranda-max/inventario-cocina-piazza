create table if not exists infraestructura (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null,
  area text,
  nivel_id uuid references mapa_niveles(id) on delete set null,
  x numeric(6, 3),
  y numeric(6, 3),
  estado text not null default 'operativo' check (
    estado in ('operativo', 'requiere_revision', 'obstruido', 'con_fuga', 'sin_acceso', 'fuera_de_servicio')
  ),
  criticidad text not null default 'media' check (criticidad in ('baja', 'media', 'alta', 'critica')),
  descripcion_ubicacion text,
  foto_url text,
  notas text,
  proveedor_id uuid references proveedores(id) on delete set null,
  fecha_ultima_revision date,
  fecha_proxima_revision date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint infraestructura_mapa_coords_check check (
    (nivel_id is null and x is null and y is null)
    or (nivel_id is not null and x is not null and y is not null and x >= 0 and x <= 100 and y >= 0 and y <= 100)
  )
);
alter table incidencias
  add column if not exists infraestructura_id uuid references infraestructura(id) on delete set null;
alter table mantenimientos
  add column if not exists infraestructura_id uuid references infraestructura(id) on delete set null;
alter table mantenimientos
  alter column equipo_id drop not null;
alter table incidencias
  drop constraint if exists incidencias_un_destino_check;
alter table incidencias
  add constraint incidencias_un_destino_check
  check (num_nonnulls(equipo_id, infraestructura_id) <= 1);
alter table mantenimientos
  drop constraint if exists mantenimientos_un_destino_check;
alter table mantenimientos
  add constraint mantenimientos_un_destino_check
  check (num_nonnulls(equipo_id, infraestructura_id) = 1);
create index if not exists idx_infraestructura_area on infraestructura(area);
create index if not exists idx_infraestructura_estado on infraestructura(estado);
create index if not exists idx_infraestructura_nivel_id on infraestructura(nivel_id);
create index if not exists idx_infraestructura_proveedor_id on infraestructura(proveedor_id);
create index if not exists idx_incidencias_infraestructura_id on incidencias(infraestructura_id);
create index if not exists idx_mantenimientos_infraestructura_id on mantenimientos(infraestructura_id);
drop trigger if exists set_infraestructura_updated_at on infraestructura;
create trigger set_infraestructura_updated_at
before update on infraestructura
for each row execute function set_updated_at();
alter table infraestructura enable row level security;
drop policy if exists "Usuarios autenticados gestionan infraestructura" on infraestructura;
create policy "Usuarios autenticados gestionan infraestructura"
on infraestructura for all
to authenticated
using (true)
with check (true);
drop function if exists registrar_mantenimiento(
  tipo_mantenimiento,
  uuid,
  text,
  text,
  numeric,
  text,
  text[],
  date,
  date,
  boolean,
  uuid
);
create or replace function registrar_mantenimiento(
  p_tipo tipo_mantenimiento,
  p_descripcion text,
  p_equipo_id uuid default null,
  p_infraestructura_id uuid default null,
  p_realizado_por text default null,
  p_costo numeric default null,
  p_repuestos_notas text default null,
  p_fotos_urls text[] default '{}',
  p_fecha_realizacion date default current_date,
  p_proxima_fecha_sugerida date default null,
  p_marcar_operativo boolean default false,
  p_incidencia_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mantenimiento_id uuid;
begin
  if num_nonnulls(p_equipo_id, p_infraestructura_id) != 1 then
    raise exception 'Selecciona equipo o infraestructura, no ambos';
  end if;

  if p_incidencia_id is not null then
    update incidencias
    set estado = 'en_progreso'
    where id = p_incidencia_id
      and (
        (
          p_equipo_id is not null
          and infraestructura_id is null
          and (equipo_id = p_equipo_id or equipo_id is null)
        )
        or (
          p_infraestructura_id is not null
          and equipo_id is null
          and (infraestructura_id = p_infraestructura_id or infraestructura_id is null)
        )
      );

    if not found then
      raise exception 'La incidencia no existe o no corresponde al destino seleccionado';
    end if;
  end if;

  insert into mantenimientos (
    tipo,
    equipo_id,
    infraestructura_id,
    incidencia_id,
    descripcion,
    realizado_por,
    costo,
    repuestos_notas,
    fotos_urls,
    fecha_realizacion,
    proxima_fecha_sugerida
  )
  values (
    p_tipo,
    p_equipo_id,
    p_infraestructura_id,
    p_incidencia_id,
    p_descripcion,
    p_realizado_por,
    p_costo,
    p_repuestos_notas,
    coalesce(p_fotos_urls, '{}'),
    p_fecha_realizacion,
    p_proxima_fecha_sugerida
  )
  returning id into v_mantenimiento_id;

  if p_equipo_id is not null then
    update equipos
    set
      fecha_ultimo_mantenimiento = p_fecha_realizacion,
      fecha_proximo_mantenimiento = coalesce(p_proxima_fecha_sugerida, fecha_proximo_mantenimiento),
      estado = case
        when p_marcar_operativo then 'operativo'::estado_equipo
        else estado
      end
    where id = p_equipo_id;

    if not found then
      raise exception 'Equipo no encontrado';
    end if;
  else
    update infraestructura
    set
      fecha_ultima_revision = p_fecha_realizacion,
      fecha_proxima_revision = coalesce(p_proxima_fecha_sugerida, fecha_proxima_revision),
      estado = case
        when p_marcar_operativo then 'operativo'
        else estado
      end
    where id = p_infraestructura_id;

    if not found then
      raise exception 'Infraestructura no encontrada';
    end if;
  end if;

  return v_mantenimiento_id;
end;
$$;
grant execute on function registrar_mantenimiento(
  tipo_mantenimiento,
  text,
  uuid,
  uuid,
  text,
  numeric,
  text,
  text[],
  date,
  date,
  boolean,
  uuid
) to authenticated;
