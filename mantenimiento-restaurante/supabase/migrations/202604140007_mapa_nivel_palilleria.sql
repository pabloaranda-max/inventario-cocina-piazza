insert into mapa_niveles (id, nombre, imagen_url, orden)
values (
  '00000000-0000-4000-8000-000000000014',
  'Palillería',
  '/mapa/palilleria.png',
  140
)
on conflict (id) do update
set nombre = excluded.nombre,
    imagen_url = excluded.imagen_url,
    orden = excluded.orden,
    visible = true;
