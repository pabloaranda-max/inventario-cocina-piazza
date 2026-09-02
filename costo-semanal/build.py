#!/usr/bin/env python3
"""Genera el reporte de costo semanal desde las cifras de datos.py.

    python3 build.py            reporte en pantalla y en reporte-costo-semanal.txt
    python3 build.py --barra    además, la misma corrida con el inicial alterno

Nada de números escritos aquí: todo sale de datos.cuadrar().
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos

SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      'reporte-costo-semanal.txt')
A = 92  # ancho


def render(filas, T, titulo):
    L = []
    w = L.append
    ini, fin = datos.PERIODO
    w('=' * A)
    w(f'  COSTO SEMANAL · {ini} → {fin}'.ljust(A - 10) + titulo.rjust(9))
    w('=' * A)
    w('')
    w(f'  {"almacén":<10}{"inicial":>13}{"+compras":>13}{"-final":>13}'
      f'{"= COSTO":>13}{"-merma":>12}{"= CTO VTA":>13}')
    w('  ' + '-' * (A - 4))
    for a in datos.ALMACENES:
        f = filas[a]
        w(f'  {a:<10}{f["inicial"]:>13,.2f}{f["compras"]:>13,.2f}{f["final"]:>13,.2f}'
          f'{f["real"]:>13,.2f}{f["merma"]:>12,.2f}{f["venta"]:>13,.2f}')
    w('  ' + '-' * (A - 4))
    w(f'  {"TOTAL":<10}{"":>13}{T["compras"]:>13,.2f}{"":>13}'
      f'{T["real"]:>13,.2f}{T["merma"]:>12,.2f}{T["venta_costo"]:>13,.2f}')
    w('')
    w(f'  venta neta del periodo{T["venta"]:>26,.2f}')
    w('')
    w(f'  COSTO REAL{T["real"]:>38,.2f}{T["pct_real"]:>12.2f} %')
    w(f'     del cual merma{T["merma"]:>34,.2f}{T["pct_merma"]:>12.2f} %')
    w(f'     del cual venta{T["venta_costo"]:>34,.2f}{T["pct_venta"]:>12.2f} %')
    w('')
    w(f'  consumo teórico (recetas){T["teorico"]:>23,.2f}{T["pct_teorico"]:>12.2f} %')
    w(f'  brecha del costo de venta{T["brecha"]:>+23,.2f}'
      f'{T["pct_venta"] - T["pct_teorico"]:>+12.2f} pts')
    w('')
    w('  ' + '-' * (A - 4))
    w('  MERCANCÍA Y EMPAQUE — el empaque no vende, va contra la venta total')
    w('  ' + '-' * (A - 4))
    w(f'  mercancía (cocina + barra + merch){T["mercancia"]:>14,.2f}{T["pct_mercancia"]:>12.2f} %')
    w(f'  empaque{T["empaque"]:>41,.2f}{T["pct_empaque"]:>12.2f} %')
    w('')
    w('  ' + '-' * (A - 4))
    w('  POR ALMACÉN — % sobre la venta que cada uno surte')
    w('  ' + '-' * (A - 4))
    w(f'  {"almacén":<10}{"COSTO REAL":>13}{"% costo":>9}{"merma":>12}'
      f'{"costo vta":>13}{"teórico":>13}{"brecha":>12}')
    for a in datos.ALMACENES:
        f = filas[a]
        w(f'  {a:<10}{f["real"]:>13,.2f}{f["pct_real"]:>8.2f}%{f["merma"]:>12,.2f}'
          f'{f["venta"]:>13,.2f}{f["teorico"]:>13,.2f}{f["venta"] - f["teorico"]:>+12,.2f}')
    w('')
    w(f'  {"venta atribuida":<18}' + ''.join(f'{a:>14}' for a in datos.VENDEN))
    w(f'  {"  registrada POS":<18}'
      + ''.join(f'{T["base_pos"][a]:>14,.2f}' for a in datos.VENDEN))
    w(f'  {"  atribuida":<18}'
      + ''.join(f'{filas[a]["base"]:>14,.2f}' for a in datos.VENDEN))
    w(f'  postres {T["ajuste_postres"]:,.2f} y la parte del combo que surte barra '
      f'{T["ajuste_combo"]:,.2f} pasan de cocina a barra')
    w('')
    w('  ' + '-' * (A - 4))
    w('  NOTAS DE LECTURA')
    w('  ' + '-' * (A - 4))
    w('  · El % por almacén va sobre la venta que cada uno surte, no sobre la que')
    w(f'    registra el POS. Los combos cargan {T["combo"]:,.2f} de costo en barra —la bebida—')
    w('    mientras el ingreso se cobra en el producto padre, que es de cocina; y los')
    w('    postres se venden por cocina con insumos de barra. Sin corregir eso, barra')
    w(f'    daría {filas["BARRA"]["real"] / T["base_pos"]["BARRA"] * 100:.2f} % contra su venta registrada, que no significa nada.')
    w(f'  · Descuentos del periodo: {T["descuentos"]:,.2f}. Los % van sobre venta neta.')
    w('  · El empaque no factura: su % va contra la venta total.')
    w(f'  · La merma vale {T["merma"]:,.2f} ({T["pct_merma"]:.2f} %) contra una brecha de receta de')
    w(f'    {T["brecha"]:,.2f} ({T["pct_venta"] - T["pct_teorico"]:+.2f} pts). El dinero está en lo que se tira, no en la receta.')
    w('')
    w('  fuentes: ' + T['fuentes']['compras'])
    w('           ' + T['fuentes']['ventas'])
    w('           ' + T['fuentes']['merma'])
    w(f'           {T["fuentes"]["n_compras"]} líneas de compra · '
      f'{T["fuentes"]["n_ventas"]} de venta · '
      f'{T["fuentes"]["n_merma"]} folios de desperdicio')
    w('=' * A)
    return '\n'.join(L)


def main():
    filas, T = datos.cuadrar()
    txt = render(filas, T, 'base')
    if '--barra' in sys.argv:
        f2, T2 = datos.cuadrar(inicial_barra=datos.INICIAL_BARRA_ALTERNO)
        txt += '\n\n' + render(f2, T2, 'alterno')
        txt += (f'\n  El inicial alterno de barra mueve el total en '
                f'{T2["real"] - T["real"]:+,.2f} '
                f'({T2["pct_real"] - T["pct_real"]:+.2f} pts) y deja el costo de '
                f'barra en\n  {f2["BARRA"]["venta"]:,.2f} contra un teórico de '
                f'{f2["BARRA"]["teorico"]:,.2f} — por debajo de su propio consumo.\n')
    print(txt)
    with open(SALIDA, 'w') as fh:
        fh.write(txt + '\n')
    print(f'\nescrito en {SALIDA}')


if __name__ == '__main__':
    main()
