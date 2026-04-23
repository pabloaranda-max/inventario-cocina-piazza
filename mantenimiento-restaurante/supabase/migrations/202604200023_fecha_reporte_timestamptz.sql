-- Cambia fecha_reporte de date a timestamptz para guardar hora exacta del reporte.
ALTER TABLE incidencias ALTER COLUMN fecha_reporte TYPE timestamptz USING fecha_reporte::timestamptz;
ALTER TABLE incidencias ALTER COLUMN fecha_reporte SET DEFAULT now();

-- Actualiza la función RPC para usar now() internamente en lugar de recibir la fecha.
create or replace function reportar_incidencia(
  p_descripcion text,
  p_prioridad prioridad_incidencia,
  p_reportado_por text,
  p_foto_url text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket text;
begin
  insert into incidencias (descripcion, prioridad, reportado_por, fecha_reporte, foto_url, estado)
  values (p_descripcion, p_prioridad, p_reportado_por, now(), p_foto_url, 'pendiente_asignacion')
  returning ticket_numero into v_ticket;

  return json_build_object('ticket_numero', v_ticket);
end;
$$;

grant execute on function reportar_incidencia to anon;
