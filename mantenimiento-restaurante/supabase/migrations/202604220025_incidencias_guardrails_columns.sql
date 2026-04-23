-- Columnas de soporte para flujo completo de incidencias.
alter table incidencias
  add column if not exists asignado_a text,
  add column if not exists fecha_resuelta timestamptz,
  add column if not exists validado_por text;

-- Sincroniza enum si un entorno remoto no tiene todos los estados esperados.
do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'pendiente_asignacion'
      and enumtypid = 'estado_incidencia'::regtype
  ) then
    alter type estado_incidencia add value 'pendiente_asignacion';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'abierta'
      and enumtypid = 'estado_incidencia'::regtype
  ) then
    alter type estado_incidencia add value 'abierta';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'en_progreso'
      and enumtypid = 'estado_incidencia'::regtype
  ) then
    alter type estado_incidencia add value 'en_progreso';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'resuelta'
      and enumtypid = 'estado_incidencia'::regtype
  ) then
    alter type estado_incidencia add value 'resuelta';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumlabel = 'cerrada'
      and enumtypid = 'estado_incidencia'::regtype
  ) then
    alter type estado_incidencia add value 'cerrada';
  end if;
end $$;
