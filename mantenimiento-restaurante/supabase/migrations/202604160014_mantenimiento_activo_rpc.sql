alter table mantenimientos
  drop constraint if exists mantenimientos_un_destino_check;
alter table mantenimientos
  add constraint mantenimientos_un_destino_check
  check (
    num_nonnulls(equipo_id, infraestructura_id) = 1
    or (activo_id is not null and equipo_id is null and infraestructura_id is null)
  );
update mantenimientos
set activo_id = coalesce(activo_id, equipo_id, infraestructura_id)
where activo_id is null
  and coalesce(equipo_id, infraestructura_id) is not null;
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
  boolean
);
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
drop function if exists registrar_mantenimiento(
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
);
drop function if exists registrar_mantenimiento(
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
  uuid,
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
  v_activo_id uuid;
  v_intervalo integer;
begin
  v_activo_id := coalesce(p_activo_id, p_equipo_id, p_infraestructura_id);

  if p_equipo_id is not null and p_infraestructura_id is not null then
    raise exception 'Selecciona equipo o infraestructura, no ambos';
  end if;

  if v_activo_id is null then
    raise exception 'Selecciona un activo';
  end if;

  if p_incidencia_id is not null then
    update incidencias
    set estado = 'en_progreso'
    where id = p_incidencia_id
      and (
        (
          p_equipo_id is not null
          and infraestructura_id is null
          and (activo_id = v_activo_id or activo_id is null)
          and (equipo_id = p_equipo_id or equipo_id is null)
        )
        or (
          p_infraestructura_id is not null
          and equipo_id is null
          and (activo_id = v_activo_id or activo_id is null)
          and (infraestructura_id = p_infraestructura_id or infraestructura_id is null)
        )
        or (
          activo_id = v_activo_id
        )
        or (
          activo_id is null
          and equipo_id is null
          and infraestructura_id is null
        )
      );

    if not found then
      raise exception 'La incidencia no existe o no corresponde al destino seleccionado';
    end if;
  end if;

  insert into mantenimientos (
    tipo,
    activo_id,
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
    v_activo_id,
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

  if p_tipo = 'limpieza_profunda' then
    select limpieza_intervalo_dias into v_intervalo
    from activos where id = v_activo_id;

    update activos
    set
      fecha_ultima_limpieza = p_fecha_realizacion,
      fecha_proxima_limpieza = case
        when v_intervalo is not null
          then p_fecha_realizacion + v_intervalo
        else null
      end
    where id = v_activo_id;

    if not found then
      raise exception 'Activo no encontrado';
    end if;
  else
    update activos
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
    where id = v_activo_id;

    if not found then
      raise exception 'Activo no encontrado';
    end if;
  end if;

  if p_equipo_id is not null then
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
  elsif p_infraestructura_id is not null then
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
  uuid,
  uuid
) to authenticated;
