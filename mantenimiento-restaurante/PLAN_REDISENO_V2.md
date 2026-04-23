# Plan de Rediseño v2 — App Mantenimiento Restaurante

> Documento de referencia antes de ejecutar.
> Combina propuesta de DeepSeek + correcciones de contexto real del codebase.
> Última revisión: 2026-04-22

---

## 1. Objetivo

Convertir `/mapa` en el centro operativo principal del sistema.
El flujo ideal es: ver el restaurante → detectar qué pasa → reportar → asignar → ejecutar → cerrar → volver al mapa con estado actualizado.

---

## 2. Modelo Operativo

| Entidad | Rol |
|---|---|
| `mapa_zonas` | Contexto espacial principal. |
| `activos` | Objeto mantenible. Debe vivir asociado a una zona en el flujo nuevo. |
| `incidencias` | Evento operativo. Tiene ciclo de vida completo. |
| `mantenimientos` | Ejecución planificada o correctiva. En v1, todo mantenimiento nuevo creado desde incidencia debe terminar asociado a un activo. |

**Reglas duras:**
- Un activo sin zona no debería poder crearse (validar en UI, no forzar NOT NULL aún en DB por datos legacy).
- Una incidencia sin zona sigue siendo válida para datos existentes o reportes incompletos — no romper eso.
- El flujo preferido es: todo nuevo trabajo nace desde `zona` o `activo`, no desde registros flotantes.
- En v1 no asumir que todo mantenimiento histórico cumple `activo_id`, pero sí exigirlo para los nuevos correctivos creados desde incidencia cuando sea posible.

---

## 3. Estado Real del Codebase (Leer Antes de Tocar)

### Lo que YA funciona — no reescribir

**Server actions existentes:**
- `crearIncidencia` — crea con zona, activo y prioridad
- `asignarIncidencia` — asigna responsable
- `actualizarIncidencia` — edición general
- `cambiarEstadoIncidencia` — cambia estado (funciona, sin guardrails)
- `crearActivoRapido` — creación rápida desde incidencia ← **ya existe, solo necesita un modal desde el mapa**
- `eliminarIncidencia`
- `crearMantenimiento` — crea con tipo, activo, incidencia relacionada, proveedor
- `actualizarMantenimiento`
- `eliminarMantenimiento`
- `actualizarUbicacionActivo` — actualiza zona desde el mapa
- `guardarMapaZonas` — persiste geometría SVG

**Pantallas existentes:**
`/mapa`, `/incidencias`, `/incidencias/[id]`, `/incidencias/[id]/editar`,
`/incidencias/nueva`, `/mantenimientos`, `/mantenimientos/nuevo`,
`/activos`, `/activos/[id]`, `/equipos` (legacy), `/infraestructura` (legacy),
`/proveedores`, `/cotizaciones`, `/buscar`, `/reportar` (incompleta)

**Schema — ENUMs ya definidos:**
```sql
estado_incidencia:    pendiente_asignacion | abierta | en_progreso | resuelta | cerrada
prioridad_incidencia: baja | media | alta | urgente
tipo_mantenimiento:   preventivo | correctivo | limpieza_profunda
estado_equipo:        operativo | en_reparacion | fuera_de_servicio | pendiente_revision
```

### Lo que falta o está roto

- No existe flujo de cierre formal (`resuelta → cerrada` con evidencia) en la UI
- No hay relación bidireccional visible incidencia ↔ mantenimiento
- La creación de zonas en el mapa es técnicamente funcional pero UX confusa
- `/activos/[id]` existe pero sin historial operativo
- No hay dashboard ni vista de estado global por zona
- `/reportar` existe como página pero está incompleta

---

## 4. Flujos por Entidad

### Zonas
```
Modo edición (solo admin)
  → Herramienta rectángulo / polígono sobre plano SVG
  → Asigna nombre, nivel, color
  → Guarda (guardarMapaZonas ya existe)

Modo operativo (default)
  → Zonas coloreadas por estado agregado:
      rojo   = incidencia urgente/alta abierta
      amarillo = mantenimiento próximo o incidencia media
      verde  = sin alertas
  → Clic en zona → panel lateral con activos + acciones rápidas
```

### Panel lateral del mapa
```
Estados de panel en v1:
  1. Sin selección
     → resumen global del nivel
     → alertas inmediatas
     → accesos rápidos

  2. Zona seleccionada
     → nombre, estado agregado, activos de la zona
     → CTAs: reportar incidencia / nuevo activo

  3. Activo seleccionado
     → ficha breve + estado + próximas acciones
     → historial resumido

Reglas:
  - Activo seleccionado tiene prioridad visual sobre zona
  - Incidencia seleccionada no es estado propio del panel en v1
  - La edición detallada de zonas vive fuera del canvas
```

### Activos
```
Creación rápida (desde mapa)
  → Seleccionar zona → "Nuevo activo aquí"
  → Modal: nombre, categoría, proveedor (opcional)
  → `crearActivoRapido` (action YA EXISTE, no rediseñarla)
  → Activo queda asociado a zona seleccionada

Ficha completa
  → /activos/nuevo o desde /activos/[id]
  → Campos técnicos: marca, modelo, serie, fechas, manuales

Historial
  → /activos/[id] muestra incidencias + mantenimientos en orden cronológico
```

**Nota de implementación sobre activos legacy en mapa:**
- Mientras exista convivencia entre `activos` y entidades legacy, los marcadores legacy deben distinguirse visualmente.
- Propuesta mínima v1: opacidad reducida o borde punteado + etiqueta/tooltip `legacy`.
- El panel lateral debe indicar que la ficha puede estar incompleta o provenir del modelo anterior.

### Incidencias (flujo completo hasta cierre)
```
REPORTE
  → Desde mapa (clic zona/activo) o /incidencias/nueva
  → Campos: descripción, prioridad, activo (opcional), foto (obligatoria si urgente/alta)
  → Estado inicial: pendiente_asignacion

ASIGNACIÓN
  → Admin asigna responsable (campo asignado_a)
  → Estado: abierta

EJECUCIÓN
  → Responsable marca "Iniciar trabajo"
  → Estado: en_progreso
  → Puede añadir notas y fotos del proceso

RESOLUCIÓN TÉCNICA
  → Responsable marca "Trabajo finalizado" + sube foto de evidencia (obligatoria)
  → Estado: resuelta
  → Sistema pregunta: "¿Registrar mantenimiento correctivo?" → modal prellenado → crearMantenimiento
  → Si el usuario no lo crea en ese momento, la ficha de la incidencia debe conservar acción secundaria: "Generar mantenimiento"

VALIDACIÓN Y CIERRE
  → Incidencias "resueltas" aparecen en cola visible para admin/gerente
  → Admin aprueba → cerrada
  → Admin rechaza → vuelve a en_progreso con nota
  → Auto-cierre a 48h si no hay acción (configurable, implementar en v2)
```

### Mantenimientos
```
Preventivo (planificado)
  → Desde ficha de activo → programar con fecha futura
  → Aparece en mapa como alerta cuando se acerca la fecha

Correctivo (desde incidencia)
  → Se genera al resolver incidencia (ver flujo arriba)
  → incidencia_id asociado

Ejecución
  → Técnico completa checklist + sube evidencia
  → Se actualiza fecha_ultimo_mantenimiento y fecha_proximo_mantenimiento del activo
```

---

## 5. Diseño del Mapa Operativo

### Layout propuesto
```
┌─────────────────────────────────────────────┬──────────────────┐
│                                             │  PANEL LATERAL   │
│         CANVAS SVG (~70%)                   │    (~30%)        │
│                                             │                  │
│  [Plano del restaurante]                    │  Sin selección:  │
│  [Zonas coloreadas por estado]              │  resumen global  │
│  [Iconos de activos posicionados]           │                  │
│                                             │  Zona:           │
│                                             │  activos + CTA   │
│                                             │                  │
│                                             │  Activo:         │
│                                             │  ficha + acciones│
└─────────────────────────────────────────────┴──────────────────┘
│ Barra superior: búsqueda global | modo edición (admin) | config │
```

### Coloreado de zonas (lógica)
```typescript
// Por zona, consultar:
// 1. ¿Tiene incidencias abiertas urgentes/altas? → rojo
// 2. ¿Tiene incidencias abiertas medias/bajas?  → amarillo
// 3. ¿Tiene mantenimiento preventivo próximo?   → amarillo
// 4. Sin alertas                                → verde
```

**Nota de implementación:**
- No resolver este coloreado con una consulta por zona desde frontend.
- En `Sprint 1B`, priorizar una consulta agregada única a Supabase.
- Si la agregación no queda limpia con query builder, moverla a función SQL o vista.

---

## 6. Cambios de Schema Necesarios

### Tabla `incidencias` — agregar columnas
```sql
alter table incidencias
  add column if not exists asignado_a text,           -- v1: texto libre, v2: uuid a auth.users
  add column if not exists fecha_resuelta timestamptz,
  add column if not exists validado_por text;         -- v1: texto, v2: uuid
```

### Tabla `mapa_zonas` — soft delete
```sql
alter table mapa_zonas
  add column if not exists inactiva boolean not null default false;
-- Regla: no inactivar zonas con activos o incidencias activas asociadas
```

### Tabla `activos` — posición en mapa (para v1 selectbox, v2 drag&drop)
```sql
-- Ya existe zona_id y nivel_id.
-- Para v1 NO agregar posicion_x/posicion_y — la ubicación se resuelve
-- con zona_id que ya funciona con actualizarUbicacionActivo.
-- Agregar posición exacta es scope de v2.
```

> ⚠️ **NO hacer `zona_id NOT NULL` en incidencias todavía.**
> Hay registros existentes con `zona_id = null`. Hacer ese cambio requiere
> primero un `UPDATE incidencias SET zona_id = ...` para todos los huérfanos,
> y una estrategia para los que no tienen zona asignable.
> Bloquearlo en UI es suficiente para v1.

---

## 7. Migración Legacy (equipos / infraestructura → activos)

> ⚠️ **Esta tarea NO es Sprint 1. Es su propio spike.**
> Las actions existentes ya manejan ambas entidades.
> No bloquea nada de v1.

**Plan cuando llegue el momento:**
1. Script SQL que inserta en `activos` todos los registros de `equipos` e `infraestructura`
2. Mantener `equipos_detalle` e `infraestructura_detalle` con FK a `activos.id`
3. Tabla `legacy_migration (old_table, old_id, new_id)` para actualizar referencias
4. Ejecutar primero en staging con backup
5. En producción: migrar datos → actualizar FKs → revocar INSERT/UPDATE/DELETE en tablas legacy
6. A partir de v1, toda nueva creación usa exclusivamente `activos`

---

## 8. Roadmap

### v1 — "Mapa Operativo Funcional"
**Objetivo:** El mapa es el centro de mando diario.

**Criterios de éxito v1:**
- Reportar una incidencia desde el mapa en menos de 3 clics después de seleccionar zona
- Crear un activo desde una zona sin salir del flujo del mapa
- Resolver una incidencia con evidencia y opción de generar mantenimiento correctivo
- Ver el estado agregado de una zona sin salir de `/mapa`
- Consultar las zonas de un nivel sin depender de encontrarlas visualmente en la lámina

**Sprints:**

**Sprint 1A — Migraciones de DB** (bajo riesgo, hacerlo primero y aislado)
- Agregar `asignado_a`, `fecha_resuelta`, `validado_por` a `incidencias`
- Agregar `inactiva` a `mapa_zonas`
- Verificar que las acciones existentes siguen funcionando

**Sprint 1B — Panel lateral del mapa**
- Componente `SidePanel` con 3 estados: vacío / zona / activo
- Coloreado de zonas por estado (query de incidencias abiertas por zona)
- Botón "Reportar incidencia" en panel de zona → modal → `crearIncidencia`
- Botón "Nuevo activo aquí" en panel de zona → modal → `crearActivoRapido` ← **la action ya existe, solo construir entrypoint UX**

**Sprint 1C — Flujo completo de incidencias**
- Guardrails de transición de estado (no saltar estados)
- Modal de evidencia obligatoria al pasar a `resuelta`
- Cola "Pendientes de validación" en `/incidencias` (filtro por estado `resuelta`)
- Botón "Cerrar incidencia" solo para admin → `cerrada`
- Modal opcional al resolver: "¿Registrar mantenimiento correctivo?" → `crearMantenimiento`

**Sprint 1D — Ficha de activo con historial**
- `/activos/[id]` muestra incidencias + mantenimientos en orden cronológico
- Botón "Reportar incidencia" desde ficha de activo

**No entra en v1:**
- Drag & drop de activos en mapa
- Automatizaciones (WhatsApp, correo)
- Migración legacy
- Auto-cierre de incidencias
- 3D / renders

---

### v2 — "Experiencia Fluida + Semi-automatización"
- Drag & drop de activos para reubicación en mapa
- Posición exacta (`posicion_x`, `posicion_y`) en activos
- Normalización de `asignado_a` → UUID referenciando `auth.users`
- Roles granulares: "reporta" / "técnico" / "admin"
- Auto-cierre programado de incidencias resueltas (48h configurable)
- Botón "Solicitar visita" → mensaje prellenado para WhatsApp Web (human-in-the-loop)
- Dashboard de KPIs flotante sobre el mapa
- Migración legacy equipos/infraestructura → activos

---

### v3 — "Integración Avanzada"
- Render 3D navegable del plano
- Integración AR para mantenimiento en campo
- API pública para integración con sistemas externos

---

## 9. Backlog Priorizado (v1)

| # | Tarea | Sprint | Depende de | Riesgo |
|---|---|---|---|---|
| 1 | Migración DB (3 columnas incidencias + 1 zonas) | 1A | — | Bajo |
| 2 | Componente SidePanel vacío | 1B | — | Bajo |
| 3 | Coloreado de zonas por estado (query) | 1B | 1 | Medio |
| 4 | Botón "Reportar" en SidePanel → modal | 1B | 2 | Bajo |
| 5 | Botón "Nuevo activo" en SidePanel → modal crearActivoRapido | 1B | 2 | Bajo |
| 6 | Guardrails de transición de estado en incidencias | 1C | 1 | Medio |
| 7 | Modal de evidencia obligatoria al resolver | 1C | 6 | Bajo |
| 8 | Cola "Pendientes validación" en /incidencias | 1C | 1 | Bajo |
| 9 | Botón cierre para admin | 1C | 8 | Bajo |
| 10 | Modal creación mantenimiento al resolver incidencia | 1C | 7 | Medio |
| 11 | Historial en /activos/[id] | 1D | — | Bajo |
| 12 | Botón "Reportar" desde ficha de activo | 1D | 4, 11 | Bajo |

---

## 10. Decisiones Abiertas

| Decisión | Opciones | Recomendación |
|---|---|---|
| ¿`asignado_a` como texto o UUID en v1? | Texto libre vs FK a auth.users | Texto en v1, normalizar en v2 |
| ¿Forzar zona en creación de incidencia? | Validar solo en UI vs NOT NULL en DB | Solo UI en v1 |
| ¿Cómo manejar activos legacy en el mapa? | Mostrar equipos/infraestructura en mapa con estilo diferente | Mostrar con badge "legacy" hasta migración |
| ¿Quién puede cerrar incidencias? | Solo admin vs cualquier usuario | Solo admin en v1 |
| ¿Foto de evidencia obligatoria para todos los estados? | Solo urgente/alta vs todas | Urgente/alta en v1, todas en v2 |

---

## 11. Antes de Cada Sesión de Ejecución

1. Leer sección 3 (estado real del codebase) — no reescribir lo que ya funciona
2. Confirmar en cuál sprint estamos
3. Verificar que las migraciones de DB del sprint anterior están aplicadas en staging
4. Revisar las decisiones abiertas de la sección 10 para el scope del sprint

---

## 12. Estado de Ejecución — al 2026-04-23

### Sprint 1A ✅ COMPLETO
- `asignado_a`, `fecha_resuelta`, `validado_por` agregados a `incidencias`
- `pendiente_asignacion` agregado al enum `estado_incidencia`
- Migración `202604220025_incidencias_guardrails_columns.sql` **aplicada en Supabase remoto**
- Schema completo: `activos`, `infraestructura`, `equipos_detalle`, `infraestructura_detalle`, `cotizaciones` con RLS

### Sprint 1B ✅ COMPLETO
- Panel lateral responde a zona seleccionada con sus agregados
- Resumen global del nivel usa datos del nivel actual (no mezcla todo el edificio)
- Coloreado de zonas: urgentes → rojo `#dc2626`, incidencias → naranja `#f97316`, warning → amarillo, ok → neutro
- Botón "Nuevo activo aquí" en el panel → modal inline → `crearActivoRapido` con `zona_id`
- `crearActivoRapido` acepta `zona_id` opcional y revalida `/mapa` y `/activos`
- `guardarMapaZonas` mejorado: polígonos, soft-delete, nombres separados de labels
- Guardrails de transición en `/incidencias/page.tsx` (solo UI por ahora)

### Sprint 1C ✅ COMPLETO
- `cambiarEstadoIncidencia` ya valida transiciones en server-side
- Resolver incidencia `alta` o `urgente` exige evidencia
- Modal de flujo disponible tanto en ficha como en bandeja de incidencias
- Cierre restringido de forma pragmática por `ADMIN_EMAILS`
- Al resolver se puede disparar directo a `mantenimientos/nuevo?tipo=correctivo`

### Sprint 1D ✅ COMPLETO
- `/activos/[id]` ahora es una ficha operativa real, no un redirect
- Historial cronológico combinado de incidencias + mantenimientos
- Botón `Reportar incidencia` desde ficha de activo
- CTA de mantenimiento y ubicación desde la misma ficha

### Próximo bloque sugerido
- Pulir documentación y copy de `Sprint 1C`
- Definir si `ADMIN_EMAILS` basta o si entra modelo real de roles en v2
- Empezar bloque de mejoras posteriores sobre dashboard/mapa o pasar a v2

---

### Trabajo extra que hizo Codex fuera del plan original (documentar para no perder)

- `crearIncidencia` usa RPC `reportar_incidencia` y redirige a `/reportar/gracias` — flujo público anónimo
- `lib/email.ts`: notificación por Google Apps Script relay + Resend opcional al crear incidencia
- Filtros en `/incidencias/page.tsx`: por estado (`sin_asignar`, `activas`, etc.) y prioridad
- `asignarIncidencia` asocia activo + zona + actualiza campos legacy `equipo_id`/`infraestructura_id`
- Dashboard `/page.tsx` con métricas: pendientes, urgentes, limpiezas atrasadas

### ⚠️ Advertencia: crearIncidencia cambió semántica

`crearIncidencia` fue reescrita para el flujo público. Ahora usa RPC y redirige a `/reportar/gracias`.
El flujo admin desde `/incidencias/nueva` **no redirige a la lista**. Sigue siendo una decisión pendiente de UX aunque `Sprint 1C` ya esté cerrado.
