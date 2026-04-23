-- ============================================================
-- 1. Nuevo valor en el enum tipo_mantenimiento
-- ============================================================
alter type tipo_mantenimiento add value if not exists 'limpieza_profunda';
-- ============================================================
-- 2. Columnas de limpieza profunda en activos
-- ============================================================
alter table activos
  add column if not exists limpieza_intervalo_dias integer,
  add column if not exists fecha_ultima_limpieza date,
  add column if not exists fecha_proxima_limpieza date;
-- ============================================================
-- 3. Tabla cotizaciones
-- ============================================================
create sequence if not exists cotizacion_numero_seq;
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero text not null default 'COT-' || lpad(nextval('cotizacion_numero_seq')::text, 6, '0'),
  proveedor_id uuid references proveedores(id) on delete set null,
  incidencia_id uuid references incidencias(id) on delete set null,
  mantenimiento_id uuid references mantenimientos(id) on delete set null,
  monto numeric(12, 2),
  moneda text not null default 'MXN',
  estado text not null default 'pendiente_revision' check (
    estado in ('pendiente_revision', 'aprobada', 'rechazada')
  ),
  fecha_emision date not null default current_date,
  fecha_vencimiento date,
  archivo_url text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Trigger updated_at
drop trigger if exists set_cotizaciones_updated_at on cotizaciones;
create trigger set_cotizaciones_updated_at
before update on cotizaciones
for each row execute function set_updated_at();
-- RLS
alter table cotizaciones enable row level security;
drop policy if exists "Usuarios autenticados gestionan cotizaciones" on cotizaciones;
create policy "Usuarios autenticados gestionan cotizaciones"
on cotizaciones for all
to authenticated
using (true)
with check (true);
-- ============================================================
-- 4. Extender RPC registrar_mantenimiento para limpiezas
--    Agrega p_activo_id; si tipo = limpieza_profunda actualiza
--    las columnas de limpieza en activos.
-- ============================================================
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
  p_incidencia_id uuid default null,
  p_activo_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mantenimiento_id uuid;
  v_intervalo integer;
begin
  -- Para limpiezas profundas se puede usar activo_id O equipo_id/infraestructura_id
  if p_tipo = 'limpieza_profunda' then
    if num_nonnulls(p_activo_id, p_equipo_id, p_infraestructura_id) = 0 then
      raise exception 'Selecciona un activo, equipo o infraestructura';
    end if;
  else
    if num_nonnulls(p_equipo_id, p_infraestructura_id) != 1 then
      raise exception 'Selecciona equipo o infraestructura, no ambos';
    end if;
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
        or p_activo_id is not null
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

  -- Actualizar fechas según tipo
  if p_tipo = 'limpieza_profunda' and p_activo_id is not null then
    select limpieza_intervalo_dias into v_intervalo
    from activos where id = p_activo_id;

    update activos
    set
      fecha_ultima_limpieza = p_fecha_realizacion,
      fecha_proxima_limpieza = case
        when v_intervalo is not null
          then p_fecha_realizacion + v_intervalo
        else null
      end
    where id = p_activo_id;

    if not found then
      raise exception 'Activo no encontrado';
    end if;

  elsif p_equipo_id is not null then
    update equipos
    set
      fecha_ultimo_mantenimiento = p_fecha_realizacion,
      fecha_proximo_mantenimiento = coalesce(
        p_proxima_fecha_sugerida,
        fecha_proximo_mantenimiento
      ),
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
      fecha_proxima_revision = coalesce(
        p_proxima_fecha_sugerida,
        fecha_proxima_revision
      ),
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
-- Revocar grant anterior y re-otorgar con la nueva firma
revoke execute on function registrar_mantenimiento(
  tipo_mantenimiento, text, uuid, uuid, text, numeric, text, text[], date, date, boolean, uuid
) from authenticated;
grant execute on function registrar_mantenimiento(
  tipo_mantenimiento, text, uuid, uuid, text, numeric, text, text[], date, date, boolean, uuid, uuid
) to authenticated;
