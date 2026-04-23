-- Elimina las áreas semilla que no están en uso.
delete from areas
where nombre in ('Azotea / exterior', 'Baños', 'Cuarto frío', 'Oficina')
  and not exists (select 1 from equipos where area = areas.nombre)
  and not exists (select 1 from mapa_zonas where area = areas.nombre);
