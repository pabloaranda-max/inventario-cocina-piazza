#!/usr/bin/env python3
"""Genera el PDF de cada presentación usando su propia hoja de impresión."""
import sys, os
from playwright.sync_api import sync_playwright

PROY = '/home/lilp/proyectos/'
DESK = '/mnt/c/Users/P_ara/OneDrive/Desktop/Reportes Inventario Julio 2026/'
DOCS = [('presentacion-costo-julio-2026.html', 'presentacion-costo-julio-2026.pdf'),
        ('presentacion-toma-2026-07-31.html', 'presentacion-toma-2026-07-31.pdf'),
        ('tablero-inventario-julio-2026.html', 'tablero-inventario-julio-2026.pdf')]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    for src, out in DOCS:
        pg.goto('file://' + PROY + src)
        pg.emulate_media(media='print')
        pg.wait_for_timeout(900)
        pg.pdf(path=PROY + out, width='16in', height='9in',
               print_background=True, margin={'top':'0','bottom':'0','left':'0','right':'0'})
        kb = os.path.getsize(PROY + out) / 1024
        print(f'  {out:44s} {kb:6.0f} KB')
    b.close()

for _, out in DOCS:
    import shutil; shutil.copy2(PROY + out, DESK + out)
print(f'\ncopiados a «{os.path.basename(DESK.rstrip("/"))}»')
