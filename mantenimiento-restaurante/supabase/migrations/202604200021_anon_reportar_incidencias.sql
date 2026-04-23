-- Permite al rol anon insertar incidencias solo en estado pendiente_asignacion.
-- No puede leer, editar ni eliminar — solo reportar.
drop policy if exists "Anon puede reportar incidencias" on incidencias;
create policy "Anon puede reportar incidencias"
on incidencias for insert
to anon
with check (estado = 'pendiente_asignacion');
-- Permite al rol anon subir fotos a la carpeta incidencias/ del bucket.
drop policy if exists "Anon sube fotos de incidencias" on storage.objects;
create policy "Anon sube fotos de incidencias"
on storage.objects for insert
to anon
with check (
  bucket_id = 'mantenimiento'
  and (storage.foldername(name))[1] = 'incidencias'
);
