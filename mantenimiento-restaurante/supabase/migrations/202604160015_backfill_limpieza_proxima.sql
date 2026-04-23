update activos
set fecha_proxima_limpieza = case
  when fecha_ultima_limpieza is not null
    then fecha_ultima_limpieza + limpieza_intervalo_dias
  else current_date
end
where limpieza_intervalo_dias is not null
  and fecha_proxima_limpieza is null;
