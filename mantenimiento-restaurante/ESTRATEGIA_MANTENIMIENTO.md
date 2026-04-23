# Estrategia para Mantenimiento Restaurante

Fecha: 2026-04-14

Este documento guarda ideas y prioridades para evolucionar la webapp de mantenimiento. La intención es usarlo como backlog de producto y técnico antes de implementar cada bloque.

## Objetivo

Convertir la app en una herramienta operativa diaria para:

- Ubicar equipos y áreas en el mapa del restaurante.
- Ubicar infraestructura fija crítica: registros, tableros, llaves de paso, puntos hidráulicos y puntos eléctricos.
- Reportar incidencias rápido desde piso.
- Dar seguimiento a reparaciones y mantenimientos preventivos.
- Mantener historial confiable por equipo, proveedor y área.
- Reducir pérdidas por equipos fuera de servicio o mantenimientos vencidos.

## Prioridad Alta

### 1. Seguridad y accesos

- Rotar cualquier token administrativo que se haya compartido fuera de Supabase.
- Definir roles de usuario:
  - Admin: gestiona mapa, equipos, proveedores y usuarios.
  - Operación: reporta incidencias y consulta estado.
  - Técnico: actualiza mantenimientos e incidencias asignadas.
  - Lectura: consulta información sin editar.
- Endurecer RLS por rol cuando existan perfiles de usuario.

### 2. Mapa operativo

- Confirmar antes de eliminar un punto o área del mapa.
- Agregar botón "Cancelar cambios" en modo edición.
- Mostrar indicador de cambios sin guardar.
- Evitar guardar zonas con área vacía.
- Mejorar movimiento de puntos con drag más preciso.
- Mantener limpieza automática de áreas que ya no estén usadas por equipos ni zonas.
- Evaluar vista "solo mapa" para tablet o pantalla de operación.

### 3. Módulo de infraestructura

Crear un módulo separado de `equipos` para elementos fijos del inmueble. No todo lo mantenible es un equipo con marca, modelo o número de serie; hay puntos críticos que pertenecen a la infraestructura del restaurante.

Ejemplos:

- Registros de desagüe.
- Trampas de grasa.
- Coladeras.
- Tableros eléctricos.
- Breakers o circuitos clave.
- Llaves de paso de agua.
- Válvulas de gas.
- Puntos hidráulicos.
- Puntos sanitarios.
- Cárcamos o bombas fijas.
- Extractores o ductos si se quieren manejar como infraestructura en vez de equipo.
- Accesos técnicos, registros ocultos o plafones relevantes.

Campos sugeridos:

- Nombre.
- Tipo de infraestructura.
- Área.
- Nivel o lámina del mapa.
- Coordenadas en mapa.
- Estado.
- Criticidad.
- Descripción de ubicación.
- Fotos.
- Notas técnicas.
- Proveedor o responsable habitual.
- Fecha de última revisión.
- Fecha de próxima revisión.

Estados sugeridos:

- Operativo.
- Requiere revisión.
- Obstruido.
- Con fuga.
- Sin acceso.
- Fuera de servicio.

Criticidad sugerida:

- Baja.
- Media.
- Alta.
- Crítica.

Relación con el mapa:

- Los elementos de infraestructura deben poder aparecer como puntos distintos a las áreas.
- Deben tener iconos o colores diferentes por tipo: eléctrico, hidráulico, sanitario, gas, extracción.
- Desde el punto del mapa se debe poder abrir la ficha de infraestructura.
- Una incidencia debe poder asociarse a un equipo o a un elemento de infraestructura.

Modelo técnico posible:

- Crear tabla `infraestructura`.
- Crear tabla o enum para tipos de infraestructura.
- Agregar `infraestructura_id` opcional en `incidencias`.
- Evaluar si `mantenimientos` debe aceptar `equipo_id` o `infraestructura_id`.
- Mantener áreas como catálogo compartido.
- Reutilizar el mapa operativo para equipos, áreas e infraestructura.

### 4. QR por equipo e infraestructura

- Generar QR para cada equipo apuntando a `/equipos/[id]`.
- Generar QR para cada elemento de infraestructura apuntando a su ficha.
- Agregar botón para imprimir o descargar QR.
- Permitir abrir desde el QR una acción rápida de "Reportar incidencia".
- Incluir en la ficha:
  - Nombre.
  - Área.
  - Estado.
  - Última revisión o mantenimiento.
  - Próxima revisión o mantenimiento.

### 5. Reporte rápido de incidencias

- Crear flujo móvil simplificado:
  - Equipo o área.
  - Infraestructura, cuando aplique.
  - Prioridad.
  - Foto.
  - Descripción corta.
  - Enviar.
- Permitir reportar incidencia desde:
  - Ficha de equipo.
  - Ficha de infraestructura.
  - Mapa.
  - QR del equipo.
  - QR de infraestructura.
- Agregar mensajes claros de éxito y error.

### 6. Historial y auditoría

- Crear tabla `audit_log` para registrar cambios importantes.
- Guardar:
  - Usuario.
  - Acción.
  - Tabla afectada.
  - Registro afectado.
  - Valores relevantes antes/después cuando aplique.
  - Fecha.
- Auditar especialmente:
  - Cambios de estado de equipos.
  - Cambios de estado de infraestructura.
  - Creación/cierre de incidencias.
  - Registro de mantenimientos.
  - Edición del mapa.

## Prioridad Media

### 7. Dashboard operativo

Agregar una vista inicial con KPIs:

- Incidencias abiertas.
- Incidencias urgentes.
- Equipos fuera de servicio.
- Mantenimientos vencidos.
- Próximos mantenimientos.
- Áreas con más incidencias.
- Proveedores más utilizados.

### 8. Calendario de mantenimientos

- Vista mensual/semanal con mantenimientos preventivos.
- Resaltar vencidos.
- Filtrar por área, proveedor o estado del equipo.
- Crear acceso rápido para registrar mantenimiento realizado.

### 9. Estados más accionables

Evaluar estados adicionales para incidencias:

- Abierta.
- Asignada.
- En diagnóstico.
- Esperando proveedor.
- Esperando refacción.
- Resuelta.
- Cerrada.

Esto ayudaría a distinguir una incidencia realmente en trabajo de una que está bloqueada.

### 10. Notificaciones

Explorar notificaciones por correo, Slack o WhatsApp manual para:

- Incidencia urgente creada.
- Equipo marcado fuera de servicio.
- Infraestructura crítica con incidencia abierta.
- Mantenimiento vencido.
- Incidencia sin movimiento por varios días.

### 11. Adjuntos múltiples

- Permitir varias fotos por incidencia.
- Permitir varias fotos por mantenimiento.
- Guardar comentarios o notas junto a cada foto cuando haga sentido.
- Comprimir imágenes antes de subir para controlar costo y almacenamiento.

## Prioridad Técnica

### 12. Tests básicos

Agregar pruebas para server actions críticas:

- Crear y actualizar equipo.
- Guardar mapa.
- Eliminar zonas y limpiar áreas no usadas.
- Crear incidencia.
- Registrar mantenimiento.

### 13. Exportación y respaldo

- Exportar CSV de:
  - Equipos.
  - Infraestructura.
  - Incidencias.
  - Mantenimientos.
  - Proveedores.
- Documentar proceso de respaldo desde Supabase.

### 14. Datos base y migraciones

- Mantener áreas base, niveles del mapa y semillas importantes en migraciones claras.
- Documentar qué migraciones ya están aplicadas en remoto.
- Evitar cambios manuales en base que no queden reflejados en `supabase/migrations`.

### 15. Performance y almacenamiento

- Comprimir fotos antes de subir.
- Limitar tamaño máximo de archivo en frontend y backend.
- Evaluar thumbnails para listados.
- Revisar uso de Storage periódicamente.

## UX y Operación

### 16. Búsqueda global

Agregar búsqueda por:

- Nombre de equipo.
- Número de serie.
- Nombre o tipo de infraestructura.
- Área.
- Proveedor.
- Número de ticket.

### 17. Filtros guardados

Crear accesos rápidos:

- Urgentes abiertas.
- Equipos fuera de servicio.
- Mantenimientos vencidos.
- Incidencias por área.
- Incidencias por proveedor.

### 18. Mensajes consistentes

- Unificar mensajes de éxito y error en formularios.
- Mostrar confirmaciones después de crear, editar o cerrar registros.
- Mantener el mismo patrón visual en equipos, incidencias, mantenimientos y proveedores.

## Orden Sugerido de Implementación

1. Rotar token administrativo compartido.
2. Confirmación y cancelación en edición del mapa.
3. Diseñar e implementar módulo de infraestructura.
4. QR por equipo e infraestructura.
5. Reporte rápido de incidencias desde móvil.
6. Dashboard operativo inicial.
7. Calendario de mantenimientos.
8. Auditoría básica.
9. Roles de usuario y RLS más estricta.
10. Exportaciones CSV.
11. Adjuntos múltiples y compresión de imágenes.

## Notas de Decisión

- Priorizar herramientas que reduzcan fricción en operación diaria.
- Evitar sobrecomplicar el sistema antes de validar uso real en piso.
- Mantener el mapa como punto central de consulta, pero no depender exclusivamente de él.
- Usar Supabase como fuente única de verdad para equipos, infraestructura, áreas, incidencias y mantenimientos.
- Documentar cada cambio estructural en migraciones y en este archivo cuando afecte la estrategia.
