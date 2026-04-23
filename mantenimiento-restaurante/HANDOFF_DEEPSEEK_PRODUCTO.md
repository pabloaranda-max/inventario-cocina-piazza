# Handoff Producto + Arquitectura Para DeepSeek

## Contexto

Estoy rediseñando una webapp de mantenimiento para restaurante.

Stack actual:
- Next.js
- Supabase
- Cloudflare Pages

Entidades principales:
- `zona`: contexto espacial y operativo
- `activo`: objeto mantenible
- `incidencia`: evento operativo o problema reportado
- `mantenimiento`: ejecución, seguimiento o resolución

Pantallas importantes:
- `/mapa`
- `/incidencias`
- `/activos`

Archivo principal del mapa:
- `app/mapa/mapa-operativo.tsx`

## Objetivo

Quiero convertir `mapa + dashboard` en un solo centro operativo realmente útil.

La app debería permitir este flujo ideal:
1. Ver el restaurante por zonas.
2. Detectar qué pasa en cada zona.
3. Reportar una incidencia o crear un activo sin fricción.
4. Asignar responsable, seguimiento, ejecución y cierre.
5. Volver al mapa y ver el estado actualizado.

## Decisión Estratégica Actual

No quiero rediseñar pantallas aisladas.
Quiero definir el flujo operativo principal del sistema y luego alinear mapa, incidencias, activos y mantenimientos alrededor de ese flujo.

## Problemas Actuales

- La creación de zonas sigue sin sentirse natural.
- La visualización del mapa todavía no convence del todo.
- Las incidencias quedaron mejor, pero todavía no tienen un flujo completo hasta cierre.
- La creación de activos no convence del todo.
- La interacción entre zonas, activos, incidencias y mantenimientos no se siente coherente.
- El sistema tiene piezas útiles, pero no una experiencia operativa unificada.

## Estado Actual

En el mapa ya existe parte de esta base:
- selección por zona real
- overlay SVG
- soporte de polígonos
- edición de vértices
- resize de rectángulos
- edición lateral de zonas
- lista de zonas por nivel
- modo operativo más limpio que antes

Pero todavía falta una definición fuerte de producto y UX.

## Modelo Operativo Propuesto

- `Zona` = contexto espacial
- `Activo` = objeto mantenible
- `Incidencia` = evento operativo
- `Mantenimiento` = ejecución o resolución planificada/correctiva

Regla deseada:
- todo debería nacer desde `zona` o `activo`
- nada importante debería quedar flotando sin contexto

## Prioridades

1. Flujo completo de incidencias
2. Rediseño de mapa y zonas
3. Simplificación de creación de activos
4. Mejor integración entre todo

## Enfoque Pedido

Prioriza primero:
1. Flujo completo de incidencias
2. Mapa y zonas
3. Activos

No optimices todo al mismo tiempo.

## Lo Que Necesito De Ti

Ayúdame a desarrollar esto con más profundidad.

Quiero que propongas:
- un plan de producto más detallado
- flujos ideales por entidad
- backlog priorizado
- pantallas necesarias
- huecos de UX
- huecos de lógica de negocio

## Entregables Que Quiero

1. Un mapa de flujos para:
- zonas
- activos
- incidencias
- mantenimientos

2. Una propuesta de roadmap por fases:
- `v1`
- `v2`
- `v3`

3. Una propuesta concreta para:
- creación de zonas
- mapa operativo
- flujo completo de incidencias hasta cierre
- creación rápida vs ficha completa de activos

4. Reglas de negocio recomendadas:
- estados de incidencia
- relación entre incidencia y mantenimiento
- relación entre zona y activo
- cuándo algo puede existir sin zona o sin activo

## Schema de Base de Datos (Supabase/PostgreSQL)

### Tablas existentes
- `proveedores`
- `equipos` — entidad legacy, se está migrando a `activos`
- `infraestructura` — entidad legacy, se está migrando a `activos`
- `activos` — entidad unificada que reemplaza equipos e infraestructura
- `equipos_detalle` / `infraestructura_detalle` — metadatos extendidos (tablas 1:1)
- `incidencias`
- `mantenimientos`
- `cotizaciones`
- `areas` — catálogo simple de áreas
- `mapa_niveles` — niveles del plano (planta baja, primer piso, etc.)
- `mapa_zonas` — zonas dibujadas sobre el plano

### ENUMs
```sql
estado_equipo:      operativo | en_reparacion | fuera_de_servicio | pendiente_revision
prioridad_incidencia: baja | media | alta | urgente
estado_incidencia:  pendiente_asignacion | abierta | en_progreso | resuelta | cerrada
tipo_mantenimiento: preventivo | correctivo | limpieza_profunda
```

### Relaciones clave
- `incidencias` → `activo_id` (nullable), `equipo_id` (nullable, legacy), `zona_id` (nullable), `zona_nombre` (desnormalizado)
- `mantenimientos` → `activo_id` (nullable), `equipo_id` (nullable, legacy), `incidencia_id` (nullable), `zona_id` (nullable), `proveedor_id` (nullable)
- `activos` → `zona_id` (nullable), `nivel_id` (nullable), `proveedor_id` (nullable)
- `mapa_zonas` → `nivel_id` (required), `parent_id` (nullable, para subzonas), `geometry jsonb`
- `cotizaciones` → `activo_id` (nullable), `incidencia_id` (nullable), `proveedor_id`

### Estado de `incidencias`
El estado actual tiene 5 valores pero **no hay transición de cierre definida en la UI** — `resuelta` y `cerrada` existen en el enum pero ningún flujo los activa formalmente. Tampoco hay campo de `responsable` nativo en incidencias (se asigna vía mantenimiento relacionado).

## Lo Que Ya Funciona (No Reescribir)

### Server Actions existentes
- `crearIncidencia` — crea con zona, activo y prioridad
- `asignarIncidencia` — asigna responsable
- `actualizarIncidencia` — edición general
- `cambiarEstadoIncidencia` — transición de estado (funciona, pero sin guardrails de flujo)
- `crearActivoRapido` — creación rápida desde flujo de incidencia
- `eliminarIncidencia`
- `crearMantenimiento` — crea con tipo, activo, incidencia relacionada, proveedor
- `actualizarMantenimiento`
- `eliminarMantenimiento`
- `actualizarUbicacionActivo` — actualiza zona desde el mapa
- `guardarMapaZonas` — persiste geometría de zonas SVG

### Pantallas existentes
`/mapa`, `/incidencias`, `/incidencias/[id]`, `/incidencias/[id]/editar`, `/incidencias/nueva`, `/mantenimientos`, `/mantenimientos/nuevo`, `/activos`, `/activos/[id]`, `/equipos` (legacy), `/infraestructura` (legacy), `/proveedores`, `/cotizaciones`, `/buscar`, `/reportar`

### Lo que falta y está roto
- No existe flujo de cierre formal de incidencia (resuelta → cerrada con evidencia)
- No hay relación bidireccional visible incidencia ↔ mantenimiento en la UI
- La creación de zonas en el mapa es técnicamente funcional pero UX confusa
- `/activos` lista pero la ficha de detalle `/activos/[id]` existe sin historial operativo
- No hay dashboard ni vista de estado global por zona
- `/reportar` existe como página pero está incompleta

## Restricción

No quiero una respuesta abstracta ni genérica.
Quiero una propuesta pragmática, operativa y orientada a implementación real.
Toma en cuenta el schema y las actions existentes — no propongas reescribir lo que ya funciona.

## Formato de Respuesta Esperado

Quiero que respondas en este orden:
1. Diagnóstico del sistema actual
2. Flujo operativo ideal
3. Propuesta de producto por módulos
4. Roadmap `v1` / `v2` / `v3`
5. Backlog priorizado
6. Riesgos, dependencias y decisiones abiertas
