# Plan de Slices — Centro de Mando Mantenimiento Restaurante

> Documento de ejecución incremental.
> Reemplaza el enfoque anterior de "rediseño" por un plan real de slices sobre el codebase existente.
> Última actualización: 2026-04-28

---

## 1. Dirección del producto

La app no se va a rediseñar completa.

La dirección correcta es:

- mantener la arquitectura actual
- iterar por slices pequeños
- convertir `/mapa` en el centro de mando operativo
- conservar las pantallas existentes como vistas de detalle, captura o administración
- mover la operación diaria hacia contexto por `zona`

La operación nueva ya no gira alrededor de proveedores externos como flujo principal.
Ahora el modelo operativo es:

- mantenimiento interno resuelve la mayoría de los casos
- proveedores se usan sólo en casos específicos
- el mapa debe responder primero:
  - qué hacer
  - qué está atorado
  - qué es urgente
  - qué necesita presupuesto

---

## 2. Reglas de producto

- `zona` es la unidad operativa principal del mapa.
- Un `activo` nuevo debe quedar asociado a una zona.
- El mapa ya no debe depender de posición exacta de activos.
- `limpiezas profundas` no son subtipo de `incidencia`.
- `limpiezas profundas` no son subtipo de `mantenimiento`.
- `cotizaciones` deben evolucionar a trazabilidad completa:
  `necesidad -> cotización -> presupuesto -> ejecución -> costo real`
- Guardar fechas en UTC, operar en `America/Mexico_City`.

---

## 3. Estado real del repo al iniciar este plan

### Ya estaba en el repo

- `mapa_zonas` con geometría y edición.
- `activos`, `incidencias`, `mantenimientos`, `cotizaciones`.
- server actions útiles ya existentes.
- flujo híbrido entre `activos` y entidades legacy (`equipos`, `infraestructura`).

### Problemas detectados al arrancar

- bug real de timezone en defaults, filtros y cron
- mapa mezclando `zona_id` con `area`
- activos todavía operando con `x/y` como pins
- `limpieza_profunda` modelada dentro de `mantenimientos`
- `cotizaciones` sin modelo de necesidad/presupuesto/costo real
- dashboard útil, pero separado del centro de mando
- layout con ancho desperdiciado

---

## 4. Estrategia de slices

Orden de ejecución:

1. base de fechas y timezone
2. zona como fuente de verdad operativa
3. panel del mapa como centro de mando
4. limpiezas profundas como entidad propia
5. feed operativo compartido dashboard -> mapa
6. necesidades / cotizaciones / presupuesto / costo real
7. vista de presupuesto interna
8. inventario de herramientas, refacciones y consumibles
9. layout y ancho útil

Regla de ejecución:

- no cerrar un slice sólo porque "ya cambió la UI"
- cada slice se cierra cuando la lógica y los datos quedan coherentes
- si un slice toca schema, debe quedar explícito

---

## 5. Slice 0 — Fecha / Hora / Timezone

### Objetivo

Eliminar desfases entre UTC y operación CDMX antes de tocar calendario, presupuesto o recurrencias.

### Alcance

- helpers centrales para `today`, `date input`, `days from now`
- render de fechas en `America/Mexico_City`
- defaults de formularios
- filtros de "hoy", "vencido", "próximo"
- cron de cleanup
- alinear `schema.sql` con migraciones reales

### Estado

`COMPLETO`

### Ya quedó hecho

- helpers MX centralizados en `lib/utils.ts`
- reemplazo de usos problemáticos de `toISOString().slice(0, 10)`
- cron de cleanup corregido a mes operativo CDMX
- aritmética de fechas unificada para recurrencias
- `fecha_reporte` alineada entre schema y migraciones

### Resultado esperado ya cubierto

- "hoy" correcto en CDMX
- vencidos correctos
- próximos correctos
- sin salto de día en la noche
- cron sin desfase mensual

---

## 6. Slice 1 — Zona como Fuente de Verdad

### Objetivo

Hacer que el mapa opere por `zona`, no por `area`, y dejar de depender de posicionamiento exacto de activos.

### Alcance

- `actualizarUbicacionActivo` simplificado a `zona_id`
- activos nuevos ubicados por zona
- eliminación de dependencia operativa de `x/y` para activos
- consistencia de filtros y agregados del mapa
- guardrails mínimos para no crear activos rápidos sin zona

### Estado

`COMPLETO`

### Ya quedó hecho

- asignación de activo por zona, no por pin
- limpieza de `x/y` al guardar ubicación de activo
- formulario de ubicación simplificado a selección de zona
- botón y copy migrados a `Asignar zona`
- `visibleActivos`, `visibleIncidencias`, `visibleLimpiezas` y `visibleInfraestructura` alineados por `zona_id`
- agregados del mapa ya no dependen de `area` para activos, incidencias, limpiezas ni infraestructura
- creación rápida de activos exige zona
- alta/edición de equipo e infraestructura ya piden zona y derivan `area` + `nivel_id`

### Compatibilidad legacy aceptada por ahora

- columnas `x/y` siguen existiendo en DB
- `area` sigue existiendo como dato descriptivo o puente legacy
- no se impuso `NOT NULL` todavía a `activos.zona_id`

### Criterio de cierre

- mapa filtra por zona de forma consistente
- activos nuevos no salen flotando sin zona
- el flujo operativo ya no requiere pin exacto

---

## 7. Slice 2 — Panel del Mapa / Centro de Mando

### Objetivo

Convertir la consola lateral del mapa en centro de mando operativo real.

Debe responder:

- qué hacer
- qué está atorado
- qué es urgente
- qué necesita presupuesto

### Alcance

- simplificar jerarquía del panel
- modularizar panel por vistas operativas
- priorizar acciones pendientes antes que historial
- separar historial de operación actual
- acciones rápidas contextuales por zona
- mantener edición de mapa separada de operación diaria

### Estado

`COMPLETO`

### Ya quedó hecho

- panel lateral ya no es sólo un bloque saturado
- estructura por vistas:
  - `Resumen`
  - `Activos`
  - `Incidencias`
  - `Limpiezas`
  - `Edición`
- creación contextual de activo y limpieza desde el mapa
- resumen por zona visible
- selección de zona y activo ya cambia el foco del panel
- navegación del panel ya vive dentro de `/mapa`
- panel extraído a componente propio
- `urgentes` visibles como bloque operativo
- `atorados` ya no significa simplemente `en_progreso`; usa criterio temporal
- contrato del panel limpio sin cast flojo del `view`

### Criterio de cierre

- el usuario puede operar una zona desde el panel sin perderse
- el panel muestra primero lo accionable
- lo histórico no compite visualmente con lo urgente
- el mapa no queda tapado innecesariamente

---

## 8. Slice 3 — Limpiezas Profundas como Entidad Propia

### Objetivo

Separar `limpiezas profundas` del modelo actual de `mantenimientos`.

### Alcance

- nueva tabla propia
- relación principal con `zona`
- responsable interno o proveedor
- notas, evidencia, costo estimado y costo real
- recurrencia semanal a anual
- estados:
  - pendiente
  - programada
  - en proceso
  - completada
  - vencida

### Regla de producto

No es subtipo de incidencia.
No es subtipo de mantenimiento.
Es una línea operativa propia.

### Sí requiere schema

Sí.

### Estado

`PENDIENTE`

### Nota importante

No mezclar este slice con pulidos del panel.
Primero cerrar slice 2, luego abrir esta entidad nueva.

---

## 9. Slice 4 — Feed Operativo Compartido Dashboard -> Mapa

### Objetivo

No perder la inteligencia del dashboard actual, pero dejar de usarlo como centro operativo.

### Alcance

- extraer consultas / agregados reutilizables
- conservar dashboard como vista de lectura ejecutiva
- mover sólo lo accionable al mapa

### El mapa debe integrar

- incidencias abiertas
- vencidos
- urgentes
- limpiezas pendientes
- mantenimientos próximos
- presupuestos en curso
- cosas atoradas

### El mapa no debe copiar

- KPIs decorativos
- bloques redundantes
- lectura gerencial no accionable

### Estado

`PENDIENTE`

---

## 10. Slice 5 — Necesidad -> Cotización -> Presupuesto -> Costo Real

### Objetivo

Dejar atrás el modelo de "guardar cotizaciones sueltas".

### Alcance

- entidad raíz de necesidad operativa
- múltiples cotizaciones por necesidad
- cotización formal o estimada/investigada interna
- estado de necesidad:
  - pendiente
  - solicitado
  - aprobado
  - rechazado
- ejecución y costo real final

### Sí requiere schema

Sí.

### Resultado esperado

Poder contestar:

- qué necesito resolver esta semana
- qué está esperando cotización
- qué ya fue aprobado
- cuánto terminó costando

### Estado

`PENDIENTE`

---

## 11. Slice 6 — Vista de Presupuesto Interna

### Objetivo

Dar visibilidad interna semanal y mensual de necesidades operativas.

### Alcance

- vista interna, sin exportaciones al inicio
- agrupación por:
  - zona
  - prioridad
  - tipo
  - estado
- recorte por semana / mes

### Pregunta que debe contestar

`¿Qué necesito resolver esta semana?`

### Dependencia

Depende del Slice 5.

### Estado

`PENDIENTE`

---

## 12. Slice 7 — Herramientas / Refacciones / Consumibles

### Objetivo

Agregar inventario operativo de compras y materiales.

### Categorías iniciales

- herramienta
- refacción
- consumible
- material
- equipo menor
- servicio externo
- mano de obra externa

### Regla importante

Una herramienta comprada debe poder convertirse en activo.

### Sí requiere schema

Sí.

### Estado

`PENDIENTE`

---

## 13. Slice 8 — Layout / Ancho Útil

### Objetivo

Dejar de desperdiciar ancho, especialmente en `/mapa`.

### Alcance

- revisar `max-width`
- revisar containers globales
- revisar padding y margin
- dar más espacio al mapa sin romper formularios ni otras vistas

### Estado

`PENDIENTE`

### Nota

No abrir este slice antes de cerrar Slice 2.
Si no, se mezcla problema de layout con problema de jerarquía operativa.

---

## 14. Cambios de schema por slice

### No requieren schema nuevo

- Slice 0
- Slice 1
- Slice 2
- Slice 3
- Slice 8

### Sí requieren schema nuevo o ajuste fuerte

- Slice 4
- Slice 5
- Slice 6
- Slice 7

### Ajustes de datos que conviene postergar

- `activos.zona_id NOT NULL`
- retiro definitivo de columnas legacy que todavía sirven como compatibilidad
- migración total de `equipos` / `infraestructura` al modelo unificado

---

## 15. Riesgos transversales

- mezclar UI nueva con reglas de datos viejas
- cerrar slices por apariencia y no por coherencia operativa
- romper datos legacy al imponer restricciones demasiado pronto
- mezclar en un mismo commit timezone, panel, schema y presupuesto
- seguir metiendo lógica operativa en componentes gigantes sin recortar responsabilidades

---

## 15b. Checklist de cierre de slice

Antes de marcar cualquier slice como `COMPLETO`, verificar:

### Si el slice toca un campo nuevo o un flujo de datos

1. **Buscar todos los formularios que usan ese campo** — no solo el que se modificó.
   - `grep -rn "nombre_del_campo" app/`
   - Confirmar que cada form muestra el campo correctamente y que el tipo incluye lo necesario.

2. **Buscar todas las server actions que escriben ese campo** — no solo la que se modificó.
   - Confirmar que ningún `...spread` arrastra el campo a una tabla que no lo tiene.
   - Confirmar que ninguna action asume que el campo siempre viene del form si puede venir de la DB.

3. **Buscar todas las páginas que proveen datos a esos formularios** — no solo la que se modificó.
   - Confirmar que el query de Supabase incluye el campo.
   - Confirmar que el prop se pasa hasta el form.

4. **Correr el flujo completo en la versión deployada** — crear, editar, ver — antes de cerrar.
   - No cerrar basándose solo en que el build pasa o que TypeScript no tiene errores.
   - Un error de schema en runtime (columna inexistente, constraint violado) no lo detecta el compilador.

### Regla general

Si en el slice se trabajó un formulario A y existe un formulario B que hace lo mismo sobre el mismo modelo,
B también debe quedar alineado antes de cerrar.
No se cierra el slice cuando "el caso que se tocó funciona". Se cierra cuando todos los casos relacionados funcionan.

---

## 16. Orden recomendado a partir de hoy

1. abrir Slice 3 para sacar `limpiezas profundas` de `mantenimientos`
2. abrir Slice 4 para feed operativo compartido dashboard -> mapa
3. abrir Slice 5 para modelo de necesidad/presupuesto/costo real
4. construir Slice 6 sobre ese modelo
5. después abordar Slice 7
6. dejar Slice 8 para cuando el centro de mando ya esté funcional

---

## 17. Resumen ejecutivo

### Hecho

- Slice 0 — timezone / fechas
- Slice 1 — zona como fuente de verdad
- Slice 2 — panel del mapa / centro de mando

### Siguiente bloque grande

- Slice 3 — limpiezas profundas como entidad propia
- Slice 4 — feed operativo compartido dashboard -> mapa
- Slice 5 — necesidad -> cotización -> presupuesto -> costo real

### Regla para la siguiente sesión

No volver a discutir rediseño total.
Retomar desde:

`abrir Slice 3`

---

## 18. Trabajo hecho en sesión 2026-04-28

### Features nuevas

- **Fusión de incidencias**: columna `fusionada_en_id` en `incidencias`. Desde la ficha de una incidencia `pendiente_asignacion` se puede fusionar hacia cualquier incidencia activa (`pendiente_asignacion`, `abierta`, `en_progreso`). La secundaria se cierra y el principal recibe una nota automática en seguimientos.
- **Notificación Slack al resolver incidencia**: bot `mantenimiento_pasticc`, canal `C0AU3PNU2CW` (privado). Botón "Compartir en Slack" visible en incidencias `resuelta` o `cerrada`. Al enviarse guarda `reportado_slack_at` y el botón se convierte en badge "Reportado en Slack".
- **Activos organizados por nivel/zona**: la página `/activos` ahora agrupa igual que el mapa.

### Bugs corregidos

- **FK violation `mantenimientos_equipo_id_fkey`**: `getActivoContext` usaba `activo.id` como `equipo_id` aunque son tablas distintas. Corregido: mantenimientos de activos solo setean `activo_id`.
- **Dashboard conteos incluían fusionadas**: conteos de `pendientesCount`, `incidenciasCount`, `urgentesCount` ahora filtran `fusionada_en_id IS NULL`.
- **Dashboard mostraba "Sin equipo"** para incidencias ligadas a activos: queries ahora incluyen `activo:activos(...)` y usan `getDestinoNombre()`.

### Migraciones aplicadas

- `202604270028_drop_activos_sistema.sql`
- `202604270029_incidencias_fusion.sql`
- `202604280030_incidencias_slack_at.sql`

---

## 19. Deuda técnica identificada (pendiente de atender)

Ordenada por prioridad:

### Alta — afecta flujos activos hoy

1. **`AplicarPanel` incompleto**: al aplicar un mantenimiento planeado no se captura `realizado_por` ni fotos de evidencia. El action `aplicarMantenimiento` tampoco los persiste. Corregir antes de abrir Slice 3.

2. **Mantenimiento desde incidencia con `?equipo=xxx`**: `nuevo/page.tsx` inyecta el UUID de `equipos` como `selectedActivoId` en el dropdown de activos — tablas incompatibles. La incidencia crea el mantenimiento sin equipo vinculado. Requiere separar el selector de equipo del selector de activo en el form, o un flujo distinto.

3. **`FusionarPanel` solo en `pendiente_asignacion`**: si una incidencia ya `abierta` necesita fusionarse con otra, no hay UI. El candidatos-query ya soporta otros estados; falta exponer el panel en más estados.

### Media — datos incompletos pero no bloquean operación

4. **Dashboard: vencidos/próximos solo miran `equipos`**: los paneles "Mantenimientos vencidos" y "Próximos mantenimientos" ignoran activos con `fecha_proxima_revision`. Incluir activos en esas queries.

5. **`activos.zona_id NOT NULL` no impuesto**: activos pueden crearse sin zona. El plan lo pospone pero conviene añadir validación en el form antes de Slice 3.

6. **Lista de mantenimientos mezcla planeados con aplicados**: sin separación visual clara. Los planeados deberían destacar o tener sección propia.

### Baja — legacy aceptado por ahora

7. **Dualidad `activos` / `equipos` / `infraestructura`**: tres tablas separadas generan fricción. El plan los consolida eventualmente pero no antes de Slice 5-6.

8. **Columnas `x/y` siguen en DB**: legacy aceptado hasta que se decida limpiar.

9. **`limpieza_profunda` como tipo en mantenimientos**: se elimina cuando se complete Slice 3.

---

## 20. Retomar mañana desde aquí

**Paso 1 (rápido, antes de Slice 3):**
Completar `AplicarPanel` con `realizado_por` y fotos — es deuda directa del flujo planeado→aplicado.

**Paso 2:**
Abrir Slice 3 — limpiezas profundas como entidad propia.
- Nueva tabla `limpiezas_profundas` con zona, responsable, recurrencia, estados, evidencia y costo
- Retirar `limpieza_profunda` del dropdown de tipos en mantenimientos
- Migrar registros existentes si los hay
- Conectar al panel del mapa (vista Limpiezas)

**Paso 3:**
Abrir Slice 4 — feed operativo compartido dashboard → mapa.
- Extraer queries reutilizables
- Dashboard como vista ejecutiva, mapa como centro accionable
