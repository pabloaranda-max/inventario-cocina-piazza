create or replace function reportar_incidencia(
  p_descripcion text,
  p_prioridad prioridad_incidencia,
  p_reportado_por text,
  p_fecha_reporte date,
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
  values (p_descripcion, p_prioridad, p_reportado_por, p_fecha_reporte, p_foto_url, 'pendiente_asignacion')
  returning ticket_numero into v_ticket;

  return json_build_object('ticket_numero', v_ticket);
end;
$$;

grant execute on function reportar_incidencia to anon;
