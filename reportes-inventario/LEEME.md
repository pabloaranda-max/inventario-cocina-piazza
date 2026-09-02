# Reportes de inventario — generador

Los cinco entregables del mes se construyen desde un solo archivo de cifras.
Si un número cambia, cambia en todos o el build falla.

## Uso

```bash
cd /home/lilp/proyectos/reportes-inventario
python3 build_todo.py
```

Reconstruye todo, audita y copia al escritorio. Un solo comando.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `datos.py` | **Las cifras.** Único lugar donde se editan. Trae cuadres que fallan si algo no cierra. |
| `tokens.py` | Convierte las cifras en tokens `{{NOMBRE}}` y audita cifras obsoletas. |
| `build_todo.py` | Corre los cinco builds, audita y sincroniza el escritorio. |
| `costo.slides.html` | Prosa de la presentación. **No lleva números escritos: lleva tokens.** |
| `costo.body.html` | Prosa del documento largo, igual. |
| `retro.css.html` · `retro.js.html` | Estética del proyecto, extraída del resumen ejecutivo. |

## La regla

**Nunca escribas una cifra a mano en la prosa.** Usa `{{BRECHA}}`, `{{NETO}}`,
`{{COCINA_BRECHA}}`, `{{PCT_REAL}}`… Si el token no existe, el build falla en vez
de publicar un número viejo. `python3 tokens.py` no lista los tokens; para verlos:

```python
import datos, tokens
f, T, _ = datos.calcular()
print(sorted(tokens.construir(f, T)))
```

## Las tres defensas

1. **Cuadres en `datos.py`** — inicial + compras − final − merma tiene que dar el
   costo real reportado, y el neto tiene que ser el bruto menos transferencias.
   Si no, revienta antes de generar nada.
2. **Tokens sin definir** — el render falla si la prosa pide un token que no existe.
3. **Auditoría de obsoletas** — `tokens.OBSOLETAS` lista cifras que ya no deben
   aparecer en ningún entregable, incluido el Excel. Al cambiar cifras, mueve las
   viejas a esa lista.

## Para el cierre de agosto

1. Descargar de Xetux los reportes del mes a `~/Downloads` (nombres en `datos.py`).
2. Actualizar `ALM` en `datos.py` con los seis resúmenes.
3. `python3 build_todo.py`.

Cuidado con dos cosas que ya mordieron en julio:

- **Un semanal guardado como mensual** parte el periodo mensual en dos. Verifica
  que cada almacén arranque el último día del mes anterior. Si no, reconstruye el
  mes desde saldos: inventario inicial + compras del mes − inventario final.
- **La venta atribuida no es la venta del mes.** Es la venta de los productos con
  receta, los únicos que consumen de un almacén. La diferencia contra el POS son
  los productos sin receta.
