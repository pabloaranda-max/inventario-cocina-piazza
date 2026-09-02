#!/usr/bin/env python3
"""Comprueba que las defensas de datos.py muerden de verdad.

Reproduce los errores del reporte manual de agosto 2026 y verifica que cada uno
detiene el build en vez de colarse. Correr después de tocar datos.py.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos

ok = fallos = 0


def espera_muerte(nombre, fn, fragmento):
    """La corrida debe abortar y el mensaje debe explicar qué pasó."""
    global ok, fallos
    try:
        fn()
    except SystemExit as e:
        if fragmento in str(e):
            print(f'  ok    {nombre}')
            ok += 1
        else:
            print(f'  FALLO {nombre}: abortó, pero el mensaje no dice «{fragmento}»')
            print(f'        dijo: {str(e).splitlines()[0]}')
            fallos += 1
    except AssertionError:
        print(f'  ok    {nombre}  (assert)')
        ok += 1
    else:
        print(f'  FALLO {nombre}: pasó de largo, tendría que haber abortado')
        fallos += 1


print('defensas de datos.py')
print('-' * 62)

# 1. el error real: compras de empaque sin cargar -> costo negativo
_orig = datos.leer_compras


def sin_empaque():
    c, t, a, n = _orig()
    c['EMPAQUE'] = 0.0
    return c, t - sum(v for k, v in c.items() if k == 'EMPAQUE'), a, n


datos.leer_compras = sin_empaque
espera_muerte('compras de empaque sin cargar', datos.cuadrar, 'negativo')
datos.leer_compras = _orig

# 2. un almacén con movimiento que no está en el cuadro de inventarios
_inv = dict(datos.INVENTARIOS)
datos.INVENTARIOS = {k: v for k, v in _inv.items() if k != 'EMPAQUE'}
espera_muerte('almacén con compras y sin inventario', datos.cuadrar, 'sin inventario')
datos.INVENTARIOS = _inv

# 3. reporte de compras sin la columna Almacén (el primero que se bajó)
_ultimo = datos._ultimo
datos._ultimo = lambda p: (os.path.join(datos.DIR_DESCARGAS,
                                        'Reporte Detallado de Compras-Tue Aug 11 12_06_59 CST 2026.xls')
                           if 'Compras' in p else _ultimo(p))
espera_muerte('compras sin columna Almacén', datos.cuadrar, 'columna Almacén')
datos._ultimo = _ultimo

# 4. un archivo que no está
_dir = datos.DIR_DESCARGAS
datos.DIR_DESCARGAS = '/tmp/no-existe-este-directorio'
espera_muerte('reporte ausente', datos.cuadrar, 'falta el reporte')
datos.DIR_DESCARGAS = _dir

# 5. los agregados se reconstruyen desde las filas
filas, T = datos.cuadrar()
comprobaciones = [
    ('total = suma de almacenes',
     abs(T['real'] - sum(f['real'] for f in filas.values())) < 0.01),
    ('costo de venta = real − merma',
     abs(T['venta_costo'] - (T['real'] - T['merma'])) < 0.01),
    ('mercancía + empaque = real',
     abs(T['mercancia'] + T['empaque'] - T['real']) < 0.01),
    ('compras leídas = suma por almacén',
     abs(T['compras'] - sum(f['compras'] for f in filas.values())) < 0.01),
    ('venta atribuida = venta neta',
     abs(sum(filas[a]['base'] for a in datos.VENDEN) - T['venta']) < 0.01),
    ('la atribución mueve ingreso, no lo crea',
     abs(sum(T['base_pos'][a] for a in datos.VENDEN) -
         sum(filas[a]['base'] for a in datos.VENDEN)) < 0.01),
]
for nombre, cond in comprobaciones:
    if cond:
        print(f'  ok    {nombre}')
        ok += 1
    else:
        print(f'  FALLO {nombre}')
        fallos += 1

print('-' * 62)
print(f'{ok} ok · {fallos} fallos')
sys.exit(1 if fallos else 0)
