create sequence if not exists incidencia_ticket_seq;

alter table incidencias
  add column if not exists ticket_numero text;

update incidencias
set ticket_numero = 'INC-' || lpad(nextval('incidencia_ticket_seq')::text, 6, '0')
where ticket_numero is null;

alter table incidencias
  alter column ticket_numero set default 'INC-' || lpad(nextval('incidencia_ticket_seq')::text, 6, '0'),
  alter column ticket_numero set not null;

create unique index if not exists idx_incidencias_ticket_numero on incidencias(ticket_numero);

alter table mantenimientos
  add column if not exists incidencia_id uuid references incidencias(id) on delete set null;

create index if not exists idx_mantenimientos_incidencia_id on mantenimientos(incidencia_id);

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

create or replace function registrar_mantenimiento(
  p_tipo tipo_mantenimiento,
  p_equipo_id uuid,
  p_descripcion text,
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
  if p_incidencia_id is not null then
    update incidencias
    set estado = 'en_progreso'
    where id = p_incidencia_id
      and (equipo_id = p_equipo_id or equipo_id is null);

    if not found then
      raise exception 'La incidencia no existe o no corresponde al equipo seleccionado';
    end if;
  end if;

  insert into mantenimientos (
    tipo,
    equipo_id,
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

  return v_mantenimiento_id;
end;
$$;

grant execute on function registrar_mantenimiento(
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
) to authenticated;
