"""
sync_d1.py — Parsea XLS descargados por el scraper y los sube a D1 vía Worker API.

Corre como segundo paso en GitHub Actions después del scraper.

Uso:
  python3 sync_d1.py --catalogo        # sábados: catálogo + subrecetas + mise en place
  python3 sync_d1.py --inventario      # diario: snapshot de inventario actual
  python3 sync_d1.py --compras         # diario: compras del día
  python3 sync_d1.py --ventas          # diario: ventas del día
  python3 sync_d1.py --fecha 2026-03-24   # fecha específica para compras/ventas/inventario
  python3 sync_d1.py --todo            # ejecuta todo
"""

import os
import re
import glob
import json
import argparse
from pathlib import Path
from datetime import date, datetime
from dotenv import load_dotenv
import xlrd
import requests

load_dotenv(dotenv_path=Path(__file__).parent / '.env')

WORKER_URL  = os.environ["WORKER_URL"].rstrip('/')   # ej. https://piazza-operaciones.pablo-aranda.workers.dev
SYNC_TOKEN  = os.environ["SYNC_TOKEN"]               # token secreto compartido con el Worker
DL          = Path(__file__).parent / "downloads"

HEADERS = {
    'X-Sync-Token': SYNC_TOKEN,
    'Content-Type': 'application/json',
}

# ── Utilidades ────────────────────────────────────────────────────────────────

def parse_money(v) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).replace('$', '').replace(',', '').strip() or 0)

def parse_num(v) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(',', '').strip())
    except ValueError:
        return 0.0

def find_latest(pattern: str) -> Path | None:
    files = sorted(glob.glob(str(DL / pattern)))
    return Path(files[-1]) if files else None

def find_for_date(pattern_tpl: str, d: date) -> Path | None:
    """Busca archivo con la fecha exacta en el nombre."""
    slug = d.strftime('%Y%m%d')
    candidates = sorted(glob.glob(str(DL / pattern_tpl.replace('*', slug))))
    if candidates:
        return Path(candidates[0])
    # Fallback: el más reciente
    return find_latest(pattern_tpl)

def post(endpoint: str, payload: dict) -> bool:
    r = requests.post(f"{WORKER_URL}{endpoint}", headers=HEADERS, json=payload, timeout=60)
    data = r.json()
    if data.get('ok'):
        print(f"  ✓ {endpoint} — OK")
        return True
    print(f"  ✗ {endpoint} — {data.get('error')}")
    return False

# Mapeo Tipo de Producto → área para subrecetas
TIPO_A_AREA = {
    'COCINA':        'COCINA',
    'ALIMENTOS':     'COCINA',
    'BEBIDAS':       'BARRA',
    'CAFE Y TE':     'BARRA',
    'CERVEZA Y REFRESCO': 'BARRA',
    'VINO':          'CAVA',
    'ALIMENTARI':    'ALIMENTARI',
}

# ── Parsers ───────────────────────────────────────────────────────────────────

def parse_catalogo_almacen(f: Path, almacen: str) -> list[dict]:
    """
    Lee catalogo_{ALMACEN}_YYYYMMDD.xls
    Columnas esperadas: Código, Nombre/Artículo, Unidad de Medida
    """
    wb = xlrd.open_workbook(str(f))
    ws = wb.sheet_by_index(0)
    headers = [str(ws.cell_value(0, c)).strip().lower() for c in range(ws.ncols)]

    col_cod  = next((i for i, h in enumerate(headers) if 'código' in h or 'codigo' in h), 0)
    col_nom  = next((i for i, h in enumerate(headers) if 'artículo' in h or 'articulo' in h or 'nombre' in h), 1)
    col_um   = next((i for i, h in enumerate(headers) if 'unidad' in h), 2)
    col_tipo = next((i for i, h in enumerate(headers) if 'tipo' in h), -1)

    articulos = []
    for r in range(1, ws.nrows):
        codigo = str(ws.cell_value(r, col_cod)).strip()
        nombre = str(ws.cell_value(r, col_nom)).strip()
        if not codigo or not nombre:
            continue
        um     = str(ws.cell_value(r, col_um)).strip() if col_um >= 0 else ''
        tipo   = str(ws.cell_value(r, col_tipo)).strip() if col_tipo >= 0 else ''
        articulos.append({
            'id_xetux':     codigo,
            'nombre':       nombre,
            'unidad':       um,
            'almacen':      almacen,
            'tipo_producto': tipo or None,
        })
    return articulos


def parse_recetas(f: Path) -> tuple[list[dict], list[dict]]:
    """
    Lee recetas_YYYYMMDD.xls
    Retorna (subrecetas, mise_en_place)
    """
    wb = xlrd.open_workbook(str(f))
    ws = wb.sheet_by_index(0)
    headers = [str(ws.cell_value(0, c)).strip().lower() for c in range(ws.ncols)]

    # Buscar columnas
    col_sub  = next((i for i, h in enumerate(headers) if 'subreceta' in h or 'receta' in h), 0)
    col_cod_sub = next((i for i, h in enumerate(headers) if 'código' in h or 'codigo' in h), -1)
    col_ing  = next((i for i, h in enumerate(headers) if 'ingrediente' in h or 'artículo' in h or 'articulo' in h), 1)
    col_cant = next((i for i, h in enumerate(headers) if 'cantidad' in h or 'qty' in h), 2)
    col_um   = next((i for i, h in enumerate(headers) if 'unidad' in h), 3)
    col_cod_ing = next((i for i, h in enumerate(headers) if 'cod' in h and h != headers[col_sub]), -1)

    subrecetas_vistas: dict[str, dict] = {}
    mise: list[dict] = []

    current_sub  = None
    current_code = None

    for r in range(1, ws.nrows):
        sub_val = str(ws.cell_value(r, col_sub)).strip()
        ing_val = str(ws.cell_value(r, col_ing)).strip()
        cant    = parse_num(ws.cell_value(r, col_cant))
        um      = str(ws.cell_value(r, col_um)).strip() if col_um >= 0 else ''
        cod_ing = str(ws.cell_value(r, col_cod_ing)).strip() if col_cod_ing >= 0 else ''

        if sub_val and sub_val != current_sub:
            current_sub  = sub_val
            current_code = str(ws.cell_value(r, col_cod_sub)).strip() if col_cod_sub >= 0 else sub_val
            if current_code not in subrecetas_vistas:
                subrecetas_vistas[current_code] = {
                    'id_xetux':   current_code,
                    'nombre':     current_sub,
                    'unidad':     'PZA',
                    'rendimiento': 1,
                    'area':       'COCINA',  # default; se puede refinar
                }

        if current_code and ing_val and cant > 0:
            mise.append({
                'subreceta_id':      current_code,
                'ingrediente':       ing_val,
                'codigo_xetux':      cod_ing or None,
                'cantidad_por_unidad': cant,
                'unidad':            um,
            })

    return list(subrecetas_vistas.values()), mise


def parse_inventario_actual(f: Path) -> list[dict]:
    """
    Lee inventario_actual_YYYYMMDD.xls
    Columnas: Almacen, Código, Artículo, UM, Stock, Días para vencimiento,
              Último Costo, Total Ultimo Costo
    """
    wb = xlrd.open_workbook(str(f))
    ws = wb.sheet_by_index(0)
    snapshots = []
    for r in range(1, ws.nrows):
        almacen  = str(ws.cell_value(r, 1)).strip().upper()
        codigo   = str(ws.cell_value(r, 3)).strip()
        stock    = parse_num(ws.cell_value(r, 6))
        costo_u  = parse_money(ws.cell_value(r, 12))
        if not almacen or not codigo:
            continue
        snapshots.append({
            'almacen':    almacen,
            'articulo_id': codigo,
            'stock':      stock,
            'costo_unit': costo_u,
        })
    return snapshots


def parse_compras(f: Path) -> list[dict]:
    """
    Lee compras_detalle_YYYYMMDD.xls
    Columnas: Almacén, Artículo, Código, Nombre, Cantidad, UM, Subtotal
    """
    wb = xlrd.open_workbook(str(f))
    ws = wb.sheet_by_index(0)
    compras = []
    for r in range(1, ws.nrows):
        almacen = str(ws.cell_value(r, 1)).strip().upper()
        codigo  = str(ws.cell_value(r, 3)).strip()
        nombre  = str(ws.cell_value(r, 4)).strip()
        cant    = parse_num(ws.cell_value(r, 5))
        um      = str(ws.cell_value(r, 6)).strip()
        subtot  = parse_money(ws.cell_value(r, 11))
        if not almacen or not codigo or almacen in ('#',):
            continue
        compras.append({
            'almacen':    almacen,
            'articulo_id': codigo,
            'nombre':     nombre,
            'cantidad':   cant,
            'unidad':     um,
            'subtotal':   subtot,
        })
    return compras


def parse_ventas(f: Path) -> list[dict]:
    """
    Lee ventas_detalle_YYYYMMDD.xls
    Columnas: Tipo de Producto, Producto, Ambiente, Cantidad, Venta Neta, Ultimo Costo
    """
    wb = xlrd.open_workbook(str(f))
    ws = wb.sheet_by_index(0)
    ventas = []
    for r in range(1, ws.nrows):
        tipo    = str(ws.cell_value(r, 1)).strip().upper()
        prod    = str(ws.cell_value(r, 2)).strip()
        amb     = str(ws.cell_value(r, 3)).strip()
        cant    = parse_num(ws.cell_value(r, 6))
        v_neta  = parse_money(ws.cell_value(r, 8))
        costo   = parse_money(ws.cell_value(r, 12))
        if not tipo or tipo in ('#', 'TIPO DE PRODUCTO'):
            continue
        ventas.append({
            'tipo_producto': tipo,
            'producto':      prod,
            'ambiente':      amb,
            'cantidad':      cant,
            'venta_neta':    v_neta,
            'costo_teorico': costo,
        })
    return ventas

# ── Sincronizaciones ──────────────────────────────────────────────────────────

def sync_catalogo() -> None:
    """Catálogo de artículos + subrecetas + mise en place (sábados)."""
    print("\n→ Sync catálogo")

    ALMACENES = ['BARRA', 'COCINA', 'ALIMENTARI', 'CAVA', 'GENERAL', 'SALUMERIA']
    todos_articulos = []
    for alm in ALMACENES:
        f = find_latest(f"catalogo_{alm}_*.xls")
        if f:
            arts = parse_catalogo_almacen(f, alm)
            todos_articulos.extend(arts)
            print(f"  {alm}: {len(arts)} artículos (fuente: {f.name})")
        else:
            print(f"  {alm}: sin catálogo — omitido")

    subrecetas, mise = [], []
    f_rec = find_latest('recetas_*.xls')
    if f_rec:
        subrecetas, mise = parse_recetas(f_rec)
        print(f"  Recetas: {len(subrecetas)} subrecetas, {len(mise)} filas mise en place")
    else:
        print("  Sin archivo de recetas")

    post('/sync/catalogo', {
        'articulos':   todos_articulos,
        'subrecetas':  subrecetas,
        'mise_en_place': mise,
    })


def sync_inventario(target_date: date) -> None:
    """Snapshot diario de inventario actual."""
    print(f"\n→ Sync inventario {target_date}")
    f = find_for_date('inventario_actual_*.xls', target_date)
    if not f:
        print("  Sin archivo de inventario actual")
        return
    snapshots = parse_inventario_actual(f)
    print(f"  {len(snapshots)} artículos")
    post('/sync/inventario', {'fecha': str(target_date), 'snapshots': snapshots})


def sync_compras(target_date: date) -> None:
    """Compras del día."""
    print(f"\n→ Sync compras {target_date}")
    f = find_for_date('compras_detalle_*.xls', target_date)
    if not f:
        print("  Sin archivo de compras")
        return
    compras = parse_compras(f)
    print(f"  {len(compras)} líneas")
    post('/sync/compras', {'fecha': str(target_date), 'compras': compras})


def sync_ventas(target_date: date) -> None:
    """Ventas del día."""
    print(f"\n→ Sync ventas {target_date}")
    f = find_for_date('ventas_detalle_*.xls', target_date)
    if not f:
        print("  Sin archivo de ventas")
        return
    ventas = parse_ventas(f)
    print(f"  {len(ventas)} líneas")
    post('/sync/ventas', {'fecha': str(target_date), 'ventas': ventas})

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalogo',   action='store_true')
    parser.add_argument('--inventario', action='store_true')
    parser.add_argument('--compras',    action='store_true')
    parser.add_argument('--ventas',     action='store_true')
    parser.add_argument('--todo',       action='store_true')
    parser.add_argument('--fecha',      help='YYYY-MM-DD (default: hoy)')
    args = parser.parse_args()

    target = datetime.strptime(args.fecha, '%Y-%m-%d').date() if args.fecha else date.today()

    if args.todo or args.catalogo:   sync_catalogo()
    if args.todo or args.inventario: sync_inventario(target)
    if args.todo or args.compras:    sync_compras(target)
    if args.todo or args.ventas:     sync_ventas(target)

    print("\nSync completado.")

if __name__ == '__main__':
    main()
