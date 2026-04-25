# Plan de Slices — Centro de Mando Mantenimiento Restaurante

> Documento de ejecución incremental.
> Reemplaza el enfoque anterior de "rediseño" por un plan real de slices sobre el codebase existente.
> Última actualización: 2026-04-25

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
