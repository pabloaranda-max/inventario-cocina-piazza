#!/usr/bin/env python3
"""Reconstruye los cinco entregables desde las cifras canónicas y los audita.

Un solo comando: si cambia un número en datos.py, cambia en todo o el build falla.
"""
import subprocess, sys, os, shutil

S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, S)
import datos, tokens

PROY = '/home/lilp/proyectos/'
DESK = '/mnt/c/Users/P_ara/OneDrive/Desktop/Reportes Inventario Julio 2026/'
BUILDS = ['build_xlsx.py', 'build_deck.py', 'build_costo_html.py',
          'build_tablero.py', 'build_txt.py']
SALIDAS = ['costo-inventario-julio-2026.xlsx', 'presentacion-costo-julio-2026.html',
           'presentacion-toma-2026-07-31.html', 'reporte-costo-julio-2026.html',
           'tablero-inventario-julio-2026.html', 'tablero-inventario-julio-2026.txt',
           'reporte-costo-julio-2026.txt']

print('── cifras canónicas ' + '─' * 40)
filas, T, _ = datos.calcular()
print(f'   costo real {T["neto"]:,.0f} ({T["pct_real"]:.1f} %) · teórico {T["teorico"]:,.0f} '
      f'({T["pct_teo"]:.1f} %) · brecha {T["brecha"]:,.0f}')
print(f'   venta atribuida {T["venta"]:,.0f} · POS {datos.VENTA_POS:,.0f} · dif {T["dif_venta"]:,.0f}')

print('\n── construyendo ' + '─' * 44)
fallos = []
for b in BUILDS:
    r = subprocess.run([sys.executable, os.path.join(S, b)], capture_output=True, text=True)
    estado = 'ok  ' if r.returncode == 0 else 'FALLO'
    print(f'   {estado} {b}')
    if r.returncode:
        fallos.append(b); print('        ' + r.stderr.strip().splitlines()[-1])
if fallos:
    sys.exit(f'\nbuild abortado: {fallos}')

print('\n── auditoría de cifras obsoletas ' + '─' * 27)
malos = tokens.auditar([PROY + f for f in SALIDAS])
if malos:
    for f, hits in malos.items():
        print(f'   FALLO {os.path.basename(f)}: {hits}')
    sys.exit('\nhay cifras viejas en los entregables')
print('   ok    ningún entregable contiene cifras obsoletas')

print('\n── coherencia entre entregables ' + '─' * 28)
clave = {'costo real': f'{T["neto"]:,.0f}', 'brecha': f'{T["brecha"]:,.0f}',
         'venta atribuida': f'{T["venta"]:,.0f}'}
texto = ['presentacion-costo-julio-2026.html', 'reporte-costo-julio-2026.html',
         'tablero-inventario-julio-2026.html', 'tablero-inventario-julio-2026.txt',
         'reporte-costo-julio-2026.txt']
for f in texto:
    s = open(PROY + f, encoding='utf-8').read()
    falta = [k for k, v in clave.items() if v not in s]
    print(f'   {"ok   " if not falta else "FALLO"} {f}' + (f'  faltan: {falta}' if falta else ''))

print('\n── copiando al escritorio ' + '─' * 34)
os.makedirs(DESK, exist_ok=True)
for f in SALIDAS:
    shutil.copy2(PROY + f, DESK + f)
print(f'   {len(SALIDAS)} archivos en «{os.path.basename(DESK.rstrip("/"))}»')
print('\nlisto.')
