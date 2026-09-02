# Costo semanal — generador

El reporte de costo por almacén se construye desde los archivos de Xetux, no
desde cifras transcritas. Un solo comando.

```bash
cd /home/lilp/proyectos/costo-semanal
python3 build.py            # el reporte
python3 build.py --barra    # además, la corrida con el inicial alterno de barra
python3 prueba_defensas.py  # comprobar que los cuadres siguen mordiendo
```

## Por qué existe

El reporte manual de la semana del 1 al 9 de agosto de 2026 omitió las siete
líneas de compra de empaque al transcribirlas. Con las compras en cero y el
inventario final ya cargado, el costo de empaque salió en **−$26,125.50** —un
costo negativo— y nadie lo notó. El total quedó en 25.05 % cuando el real era
38.37 %: **$50,546 de costo que no aparecían**.

No fue el único. En la misma hoja: la merma de suministros ($7,625) quedó fuera
del resumen, el desglose por grupo perdió $990 de lácteos en barra, y el filtro
se hizo por fecha de documento en vez de recepción, perdiendo una entrada de
$206 del 1/08 facturada el 30/07.

Todos son errores de transcripción, y todos son invisibles a la revisión a ojo.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `datos.py` | **La fuente.** Lee compras y ventas de `~/Downloads`, trae los cuadres. |
| `build.py` | Arma el reporte. No contiene ni un número escrito a mano. |
| `prueba_defensas.py` | Reproduce los cuatro errores del reporte manual y verifica que aborten. |

## La regla

**Lo único que se teclea son los ocho totales de inventario** en `INVENTARIOS`.
Compras y ventas se leen de los `.xls` en cada corrida, así que una línea no se
puede caer al copiar. Para cerrar la semana siguiente: bajar los reportes,
reemplazar los ocho números, correr `build.py`.

## Las tres defensas

1. **Costo negativo** — si `inicial + compras − final` da menos de cero en algún
   almacén, el build se detiene y dice cuál. Es la que habría atrapado el error
   del empaque.
2. **Almacén huérfano** — si hay compras o merma de un almacén que no está en
   `INVENTARIOS`, aborta. Impide que un almacén desaparezca del cuadro.
3. **Columna obligatoria** — el reporte de compras tiene que traer `Almacén` y
   `F. Recepción`. El primer export de Xetux no trae la primera y el del reporte
   manual no traía la segunda; ambos casos abortan con instrucción de qué bajar.

Los agregados nunca se guardan: se reconstruyen desde las filas y se comparan.

## Lo que falta para cerrar del todo

- **Sólo el consumo teórico sigue tecleado** en `TEORICO`, porque no se ha
  bajado de Xetux como reporte propio (la hoja `MP consumida` del reporte
  manual). Es el consumo por explosión de recetas —lo que lo vendido debió
  gastar—, que **no** es `inicial + compras − final`: eso es el real, y el
  generador ya lo calcula. Se comparan uno contra otro y la diferencia es la
  brecha; sin el teórico no hay contra qué medir.

Resuelto el 11/08/2026:

- **No hubo transferencias** entre almacenes en el periodo.
- **El inicial de barra es 47,001.61.** El detalle de la toma XTINV000032 suma
  47,001.62 y confirma la captura. La hoja del reporte manual traía los mismos
  51 artículos con cantidades mucho más bajas —agua mineral 1 pieza contra 148,
  colimita 0 contra 60, coca regular 84 contra 252— y por eso su costo de barra
  salía por debajo de su propio teórico.
- **La merma se lee del reporte de Desperdicios**, ya no se teclea.

## Cómo se mide el % por almacén

Decidido el 11/08/2026: **atribución económica**, y el número que encabeza es el
**costo real completo** (con la merma dentro), desglosado en cuánto se vendió y
cuánto se tiró.

El POS registra el ingreso donde se cobra, no donde salió el producto, así que
`base_economica()` corrige dos cosas antes de dividir, ambas a favor de barra:

- **Postres** — se venden como 1-ALIMENTOS pero salen de barra (base de helado,
  siropes, galleta). La venta se acredita a barra.
- **Combos** — cada ENSAMBLE lleva bebida y el ingreso completo se cobra en el
  producto padre, que es de cocina. El ingreso se reparte entre las dos en
  proporción a lo que cada una pone de costo.

El reparto va por costo, no a precio de menú, para que el total siga cuadrando
con la venta neta; hay un `assert` que lo verifica. Sin esta corrección barra
daría 84 % contra su venta registrada, que no significa nada.

## Trampas de lectura

- **El empaque no vende.** Su costo va contra la venta total, no contra una
  venta propia. Medirlo como "brecha" contra un teórico no dice nada.
- **Los combos parten costo e ingreso.** Cada ENSAMBLE lleva bebida: el costo
  cae en barra y el ingreso completo se registra en el producto padre, que es de
  cocina. Barra medida contra su venta propia aparenta 84 % de costo; sin combos
  va en 30.5 %.
- **Los postres se venden por cocina y se consumen de barra** (base de helado,
  siropes, galleta). Mapear la familia POSTRES a cocina infla su costo y hunde
  el de barra en cifras casi simétricas de ~$4,500 — esa simetría es la señal.
