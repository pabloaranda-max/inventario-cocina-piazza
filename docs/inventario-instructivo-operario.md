# Instructivo del operario — antes de contar

> **Este documento es la especificación, no solo documentación.** Se escribió desde la
> cabeza de quien cuenta, y los pasos pendientes de `docs/inventario-spec.md` §15 se dan por
> terminados cuando **cada línea de aquí es verdad en la app**. Si una línea miente, o se
> arregla la app o se corrige la línea — pero no se imprime así.
>
> Estado al 2026-08-17: **4 de 8 puntos son verdad**. Los pendientes están marcados abajo.

---

## Para imprimir y leer antes de empezar

**1. Escoge tu almacén y escribe tu nombre.** Tu nombre queda en cada conteo que hagas: si
algo no cuadra después, sirve para preguntarte a ti, no para regañarte.

**2. Cuenta lugar por lugar.** Cada refri, cámara o anaquel es una *zona*. **Dentro de un
almacén todas las zonas se suman**: si el mismo producto está en dos refris, cuéntalo en
los dos, completo, cada vez. No lo repartas de memoria.

**3. Si encuentras un lugar que no está en la lista, créalo** con **"Agregar zona"** y
ponle el nombre que usan ustedes. Nunca metas ese producto en otra zona "porque se
parece". Agregar una zona no borra nada ni estorba a nadie.

**4. Los envases.** Los productos que tienen envase dado de alta se cuentan **por envase,
no por kilo**: si ves "BOTELLA 1 LT", escribe cuántas botellas hay. Cuando además hay uno
**abierto a la mitad**, usa **"desglosar"**: pones las botellas completas por un lado y lo
abierto por otro, y la app hace la cuenta.

**5. Tu teléfono guarda solo, cada 10 artículos.** No tienes que hacer nada. Aunque se
apague o se cierre la app, lo que ya contaste está a salvo en el servidor.

**6. Al terminar un lugar, dale "Cerrar esta zona".** Baja un PDF con folio —tu
comprobante de lo que contaste— y **ese lugar queda cerrado para todos**: nadie más lo
puede contar sin reabrirlo. Cierra seguido, aunque no hayas terminado el almacén. Cerrar
de más no cuesta nada; cerrar de menos sí.

**7. Para volver a entrar a un lugar ya cerrado** hay que confirmarlo, y queda registrado
quién lo reabrió y a qué hora. No es un castigo: es para que se sepa que ese conteo cambió
después de cerrarse.

**8. No le des "nueva toma".** Si necesitas contar otro lugar, usa **"Agregar zona"**. Si
necesitas volver a contar uno, usa **"Volver a contar"**. "Nueva toma" es para empezar un
almacén desde cero, y casi nunca es lo que quieres.

*¿Dudas a media cuenta? Pregunta antes de inventar. Un conteo raro se corrige; uno
inventado no se detecta.*

---

## Lo que todavía NO es verdad en la app

Para imprimir hoy: **quita los puntos 3 y 8, y en el 6 borra "queda cerrado para todos"**.
Lo demás ya funciona tal cual está escrito.

| # | Línea | Estado | Qué falta |
|---|---|---|---|
| 1 | Nombre por conteo | ✅ | — |
| 2 | Las zonas se suman | ✅ | — |
| 3 | **"Agregar zona"** | ❌ | No existe el botón **y no existe el camino en el Worker**: `zone_snapshot` es first-write-wins (`CASE WHEN zone_snapshot = '' THEN … ELSE zone_snapshot END`), así que una toma en curso no puede recibir zonas nuevas. Por eso las 6 zonas preparadas el 2026-08-16 a las 21:08 nunca aparecieron en la toma de ese día |
| 4 | Envases y desglose | ✅ | — |
| 5 | Guarda cada 10 artículos | ✅ | R28, en prod desde 2026-08-17 |
| 6 | PDF al cerrar | ✅ | — |
| 6 | **"cerrado para todos"** | ❌ | Hoy `cerrarZona` **nunca llama a `lockZone`**. Cerrar bloquea solo al propio dispositivo (`startCount` rebota si la clave ya está en `completedZones`); otro teléfono entra sin obstáculo |
| 7 | Reapertura registrada | ⚠️ | `reopenZone` ya confirma, pero no hay registro durable de quién reabrió ni cuándo |
| 8 | "Nueva toma" no se usa | ⚠️ | Desde 2026-08-17 ya no destruye la rebanada propia, pero sigue siendo un solo botón que significa dos cosas. Se resuelve al partirlo en tres |

### Decisiones ya tomadas que esto implica

**Agregar zona es append-only.** La clave de conteo es posicional (`zonaIdx:deviceId`), así
que insertar, reordenar o borrar zonas **remapea conteos existentes en silencio** — daño
que ni el acuse detecta, porque el acuse también guarda `zoneIndex`. Agregar al final es
seguro; todo lo demás se queda con el admin. Arreglo de fondo pendiente: que la clave use
el `id` de la zona, que ya existe en la config, en vez del índice.

**Cerrar es por zona, no por persona** (decisión de Pablo, 2026-08-17). Otro dispositivo
que intente contar una zona cerrada debe toparse con quién la cerró y a qué hora, y reabrir
explícitamente. Dos consecuencias a resolver al implementarlo:

- `lockedZones` expira a los 30 minutos; un cierre **no puede expirar**. O se usa otro
  campo o el cierre se exceptúa del vencimiento.
- Si Daniel cierra la zona completa y Lau nunca apretó cerrar, la rebanada de Lau se queda
  **sin acuse de cierre** — solo con sus checkpoints. Hay que decidir si el cierre de zona
  emite acuse para todas las rebanadas vivas o si basta con los checkpoints.

### Decisión ABIERTA — qué ve el operario de una zona que cerró otro

Con cierre por zona, quien se topa con un refri cerrado tiene que decidir si lo reabre. Hoy
no puede ver nada: `latestReceiptForZone` (`inventario.html:517`) filtra por
`deviceId === getDeviceId()`, así que solo ves tus propios acuses. Decidir a ciegas si
reabrir es peor que no poder reabrir, así que **algo** hay que mostrar. La pregunta sin
resolver es **cuánto**:

| | A favor | En contra |
|---|---|---|
| **Solo qué se contó** (lista de artículos, sin cantidades) | Contesta la pregunta real —"¿falta el brisket?"— sin soplarle un número a nadie. Un reconteo sigue siendo ciego, como en cualquier auditoría | Si el problema era una cantidad rara, no la ve y reabre igual |
| **El acuse completo, con cantidades** | Toda la información, cero diseño extra: el PDF ya existe y ya es inalterable | Anclaje: quien ve "17.47 kg de pechuga" confirma 17.47, no recuenta. El reconteo se vuelve teatro |

Recomendación anotada (Claude, 2026-08-17): **enseñar qué, no cuánto** en el teléfono, con
el acuse completo a un toque de distancia como acto deliberado; las cantidades sin fricción
viven en el admin, que es donde vive la responsabilidad. **Pablo no ha decidido** — queda
abierto a propósito, no se implementa hasta que se resuelva.

Lo que **no** está en discusión: el acuse ya es inalterable por construcción (SHA-256 y
`/inv/receipt?id=…` recalcula la huella). Eso ya está resuelto, se muestre lo que se muestre.

---

## Qué urge resolver, en orden

**0. Antes de contar UH_COCINA otra vez — riesgo real, no teórico.** La toma del
2026-08-16 congeló un `zoneSnapshot` de **una** zona llamada "Cocina"; la config activa
ahora tiene **seis** (`refri verduras`…`refri lacteos`). Si se cuenta bajo una fecha nueva,
la zona 0 pasa a significar "refri verduras" mientras la del 16 significaba "Cocina" — y
`unirSesionesDeAlmacen` (`js/admin-pdf.js:110`) hace merge **por código**, no por rebanada:

```js
unida.countsByZone[claveZona] = { ...(unida.countsByZone[claveZona] || {}), ...conteos };
```

Un código contado los dos días se queda con el valor del día **más nuevo** y el del 16 se
descarta en silencio. Peor: el `zoneSnapshot` unido también es por índice (línea 131), así
que los conteos del 16 aparecerían etiquetados como "refri verduras". **Hay que decidir
antes de contar si la toma del 17 continúa la del 16 o la reemplaza**, y si la reemplaza,
excluir la del 16 del export en vez de unirla. Los acuses sobreviven de todos modos.
Solo aplica a UH_COCINA: BARRA, MERCH y SUMINISTROS no tienen config de zonas.

**1. "Agregar zona"** — el hueco que causó el incidente. Necesita camino nuevo en el Worker
para **extender** un `zone_snapshot` congelado, append-only.

**2. Partir "nueva toma" en tres** — *Contar otra zona* / *Actualizar preparación* /
*Volver a contar*, y que ninguna opción del teléfono pueda destruir una rebanada del
servidor: "volver a contar" abre rebanada nueva, como hizo la restauración del 16.

**3. Cerrar zona cierra de verdad** — candado por zona que no expira, reapertura con
registro durable, y resolver la decisión abierta de arriba.

**4. Clave de zona por `id`, no por índice** — arreglo de fondo del que dependen 0, 1 y 3.
Las zonas ya traen `id` en la config; la clave de conteo lo ignora y usa la posición. Toca
acuses, merge, admin y export, así que va al final y con su propia ventana.

**5. Este instructivo deja de mentir** — se imprime completo y se mete a la app.
