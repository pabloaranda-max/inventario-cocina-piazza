"""
slack_reportes.py — Reportes automáticos de presupuesto y costos a Slack

Semanal (lunes 8am via GitHub Actions):
  Para cada área: ventas semana, compras, % costo real vs objetivo 30%,
  presupuesto disponible, artículos próximos a vencer.

Mensual (día 2 del mes):
  Auditoría de inventario por almacén: calculado vs cerrado.
  Costo real del mes vs objetivo 30%.

Uso:
  python3 slack_reportes.py --semanal
  python3 slack_reportes.py --mensual
  python3 slack_reportes.py --semanal --mensual
  python3 slack_reportes.py --semanal --desde 2026-03-17 --hasta 2026-03-23
"""

import os
import re
import glob
import argparse
from pathlib import Path
from datetime import date, timedelta
from dotenv import load_dotenv
import xlrd
import requests

load_dotenv(dotenv_path=Path(__file__).parent / '.env')

SLACK_TOKEN = os.environ["SLACK_BOT_TOKEN"]
DL = Path(__file__).parent / "downloads"

# ── Configuración de áreas ──────────────────────────────────────────────────

OBJETIVO_COSTO = 0.30

# Tipos de Producto en ventas_detalle que corresponden a cada almacén de venta
# SALUMERIA y GENERAL no tienen ventas directas — transfieren sus productos
VENTAS_POR_AREA = {
    'COCINA':     ['ALIMENTOS', 'EVENTOS I.H. ALIMENTOS', 'EVENTOS I.H BEBIDAS',
                   'EVENTOS I.H. VINOS', 'EVENTOS O.H.', 'EVENTOS'],
    'BARRA':      ['BEBIDAS', 'CAFE Y TE', 'CERVEZA Y REFRESCO'],
    'CAVA':       ['VINO', 'VINO ALIMENTARI'],
    'ALIMENTARI': ['ALIMENTARI'],
}

# Canal central de presupuestos y costos
CANAL_COSTOS = 'C0ANKMHEN77'

# Áreas con ventas directas y objetivo de costo 30%
AREAS_CON_OBJETIVO = ('COCINA', 'BARRA', 'CAVA', 'ALIMENTARI')

# Áreas sin ventas directas — sus "ventas" son transferencias enviadas
# Se muestran como informativos sin semáforo de objetivo
AREAS_INFORMATIVAS = ('SALUMERIA', 'GENERAL')

# Encargados de pedidos por área
ENCARGADOS = {
    'COCINA':    'Francisco / Matteo',
    'BARRA':     'Andy',
    'CAVA':      'Juanpi',
    'SALUMERIA': 'Emiliano',
    'GENERAL':   'Javier',
    'ALIMENTARI': 'Alexin',
}

MESES = {
    '01':'Enero','02':'Febrero','03':'Marzo','04':'Abril',
    '05':'Mayo','06':'Junio','07':'Julio','08':'Agosto',
    '09':'Septiembre','10':'Octubre','11':'Noviembre','12':'Diciembre',
}

# ── Utilidades ──────────────────────────────────────────────────────────────

def parse_money(v) -> float:
    """'$1,234.56' o float → float."""
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).replace('$', '').replace(',', '').strip() or 0)

def parse_num(v) -> float:
    """'2.25' o float → float."""
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(',', '').strip())
    except ValueError:
        return 0.0

def fmt_mxn(n: float) -> str:
    """1234567.89 → '$1,234,568'"""
    return f"${n:,.0f}"

def fmt_pct(n: float) -> str:
    """0.273 → '27.3%'"""
    return f"{n*100:.1f}%"

def semaforo(pct: float) -> str:
    if pct <= 0.25:   return "🟢"
    if pct <= 0.285:  return "🟡"
    if pct <= OBJETIVO_COSTO: return "🟠"
    return "🔴"

def slug_to_date(slug: str) -> date:
    return date(int(slug[:4]), int(slug[4:6]), int(slug[6:8]))

def fecha_larga(d: date) -> str:
    mo = f"{d.month:02d}"
    return f"{d.day} {MESES[mo]} {d.year}"

def find_files_in_range(pattern: str, d0: date, d1: date) -> list[Path]:
    """Archivos cuyo slug YYYYMMDD está entre d0 y d1."""
    result = []
    for f in glob.glob(str(DL / pattern)):
        m = re.search(r'(\d{8})', Path(f).stem)
        if m:
            try:
                fd = slug_to_date(m.group(1))
                if d0 <= fd <= d1:
                    result.append(Path(f))
            except ValueError:
                pass
    return sorted(result)

def find_latest(pattern: str) -> Path | None:
    files = sorted(glob.glob(str(DL / pattern)))
    return Path(files[-1]) if files else None

# ── Lectura de datos ────────────────────────────────────────────────────────

def read_ventas(d0: date, d1: date) -> dict[str, float]:
    """
    Suma ventas netas por Tipo de Producto para el rango de fechas.
    Retorna {tipo_producto: total_ventas}
    """
    files = find_files_in_range('ventas_detalle_*.xls', d0, d1)
    totales: dict[str, float] = {}
    for f in files:
        wb = xlrd.open_workbook(str(f))
        ws = wb.sheet_by_index(0)
        for r in range(1, ws.nrows):
            tipo = str(ws.cell_value(r, 1)).strip().upper()
            if not tipo or tipo in ('TIPO DE PRODUCTO', '#'):
                continue
            ventas = parse_money(ws.cell_value(r, 8))  # Venta Neta
            totales[tipo] = totales.get(tipo, 0) + ventas
    return totales


def read_compras(d0: date, d1: date) -> dict[str, float]:
    """
    Suma subtotal de compras por Almacén para el rango de fechas.
    Retorna {almacen: total_compras}
    """
    files = find_files_in_range('compras_detalle_*.xls', d0, d1)
    totales: dict[str, float] = {}
    for f in files:
        wb = xlrd.open_workbook(str(f))
        ws = wb.sheet_by_index(0)
        for r in range(1, ws.nrows):
            almacen = str(ws.cell_value(r, 1)).strip().upper()
            if not almacen or almacen in ('ALMACÉN', '#'):
                continue
            subtotal = parse_money(ws.cell_value(r, 11))  # Subtotal
            totales[almacen] = totales.get(almacen, 0) + subtotal
    return totales


def read_inventario_actual() -> dict[str, list[dict]]:
    """
    Lee el inventario actual más reciente.
    Retorna {'TODOS': [{codigo, nombre, um, stock, dias_vencimiento, costo_unit, costo_total}]}
    El reporte de xetux no incluye columna de almacén — es una lista plana de todos los artículos.
    Columnas: 0=#, 1=Código, 2=Artículo, 3=UM, 4=Stock, 9=Días vencimiento,
              10=Último Costo, 13=Total Costo Promedio
    """
    f = find_latest('inventario_actual_*.xls')
    if not f:
        return {}
    wb = xlrd.open_workbook(str(f))
    ws = wb.sheet_by_index(0)
    items = []
    for r in range(1, ws.nrows):
        codigo = str(ws.cell_value(r, 1)).strip()
        if not codigo or codigo == 'Código':
            continue
        stock = parse_num(ws.cell_value(r, 4))
        if stock <= 0:
            continue
        items.append({
            'codigo':           codigo,
            'nombre':           str(ws.cell_value(r, 2)).strip(),
            'um':               str(ws.cell_value(r, 3)).strip(),
            'stock':            stock,
            'dias_vencimiento': parse_num(ws.cell_value(r, 9)),
            'costo_unit':       parse_money(ws.cell_value(r, 10)),
            'costo_total':      parse_money(ws.cell_value(r, 13)),
        })
    return {'TODOS': items}


def read_mermas_mensual(d0: date, d1: date) -> dict[str, float]:
    """
    Lee mermas del mes. Retorna {almacen: total_costo_merma}
    """
    slug0 = d0.strftime('%Y%m%d')
    slug1 = d1.strftime('%Y%m%d')
    f = DL / f"mermas_{slug0}_{slug1}.xls"
    if not f.exists():
        return {}
    wb = xlrd.open_workbook(str(f))
    ws = wb.sheet_by_index(0)
    totales: dict[str, float] = {}
    # Buscar columna de almacén y costo dinámicamente
    headers = [str(ws.cell_value(0, c)).strip().lower() for c in range(ws.ncols)]
    col_almacen = next((i for i, h in enumerate(headers) if 'almac' in h), 1)
    col_costo   = next((i for i, h in enumerate(headers) if 'costo' in h or 'total' in h), -1)
    if col_costo < 0:
        return {}
    for r in range(1, ws.nrows):
        almacen = str(ws.cell_value(r, col_almacen)).strip().upper()
        if not almacen:
            continue
        costo = parse_money(ws.cell_value(r, col_costo))
        totales[almacen] = totales.get(almacen, 0) + costo
    return totales


def read_inventario_cerrado(mes_slug: str) -> dict[str, dict[str, float]]:
    """
    Lee inventarios cerrados del mes (ej. '202602').
    Retorna {almacen: {codigo: stock}}
    """
    inv: dict[str, dict] = {}
    for almacen in ['COCINA', 'BARRA', 'CAVA', 'SALUMERIA', 'ALIMENTARI', 'GENERAL']:
        f = DL / f"inventario_{almacen}_{mes_slug}.xls"
        if not f.exists():
            continue
        wb = xlrd.open_workbook(str(f))
        ws = wb.sheet_by_index(0)
        headers = [str(ws.cell_value(0, c)).strip().lower() for c in range(ws.ncols)]
        col_cod   = next((i for i, h in enumerate(headers) if 'código' in h or 'codigo' in h), 3)
        col_stock = next((i for i, h in enumerate(headers) if 'stock' in h or 'cantidad' in h), -1)
        if col_stock < 0:
            continue
        inv[almacen] = {}
        for r in range(1, ws.nrows):
            codigo = str(ws.cell_value(r, col_cod)).strip()
            stock  = parse_num(ws.cell_value(r, col_stock))
            if codigo:
                inv[almacen][codigo] = stock
    return inv

def read_transferencias(d0: date, d1: date) -> dict[str, dict[str, float]]:
    """
    Lee transferencias del periodo.
    Retorna {almacen_origen: {almacen_destino: total}} y también
    totales_enviados {almacen: total} y totales_recibidos {almacen: total}
    El XLS tiene: col 1=Almacén Origen, col 2=Almacén Destino, col última=Total
    """
    files = find_files_in_range('transferencias_*.xls', d0, d1)
    enviados: dict[str, float] = {}
    recibidos: dict[str, float] = {}
    for f in files:
        wb = xlrd.open_workbook(str(f))
        ws = wb.sheet_by_index(0)
        headers = [str(ws.cell_value(0, c)).strip().lower() for c in range(ws.ncols)]
        col_origen  = next((i for i, h in enumerate(headers) if 'origen' in h), 1)
        col_destino = next((i for i, h in enumerate(headers) if 'destino' in h), 2)
        col_total   = next((i for i, h in enumerate(headers) if 'costo total' in h), ws.ncols - 1)
        for r in range(1, ws.nrows):
            origen  = str(ws.cell_value(r, col_origen)).strip().upper()
            destino = str(ws.cell_value(r, col_destino)).strip().upper()
            if not origen or origen in ('ALMACÉN ORIGEN', '#'):
                continue
            total = parse_money(ws.cell_value(r, col_total))
            enviados[origen]   = enviados.get(origen, 0) + total
            recibidos[destino] = recibidos.get(destino, 0) + total
    return {'enviados': enviados, 'recibidos': recibidos}


# ── Slack ────────────────────────────────────────────────────────────────────

def slack_post(channel: str, text: str, blocks: list | None = None) -> None:
    payload: dict = {'channel': channel, 'text': text}
    if blocks:
        payload['blocks'] = blocks
    r = requests.post(
        'https://slack.com/api/chat.postMessage',
        headers={'Authorization': f'Bearer {SLACK_TOKEN}', 'Content-Type': 'application/json'},
        json=payload,
        timeout=10,
    )
    data = r.json()
    if not data.get('ok'):
        print(f"  ⚠ Slack error en {channel}: {data.get('error')}")
    else:
        print(f"  ✓ Mensaje enviado a {channel}")


def bloque_texto(texto: str) -> dict:
    return {"type": "section", "text": {"type": "mrkdwn", "text": texto}}

def bloque_divisor() -> dict:
    return {"type": "divider"}

# ── Reporte semanal ─────────────────────────────────────────────────────────

def reporte_semanal(d0: date, d1: date) -> None:
    print(f"\n→ Reporte semanal {d0} - {d1}")

    ventas_por_tipo  = read_ventas(d0, d1)
    compras_por_alma = read_compras(d0, d1)
    transferencias   = read_transferencias(d0, d1)
    inv_actual       = read_inventario_actual()

    semana_label = f"{fecha_larga(d0)} — {fecha_larga(d1)}"

    # Ventas directas por área
    def ventas_area(area: str) -> float:
        tipos = VENTAS_POR_AREA.get(area, [])
        return sum(ventas_por_tipo.get(t, 0) for t in tipos)

    # Totales globales (todas las áreas, excluye comida personal)
    EXCLUIR = {'ALMACEN COMIDA PERSONAL'}
    total_ventas  = sum(ventas_por_tipo.values())
    total_compras = sum(v for k, v in compras_por_alma.items() if k not in EXCLUIR)
    pct_general   = total_compras / total_ventas if total_ventas else 0

    bloques = [
        bloque_texto(f"*Resumen semanal de costos*\n_{semana_label}_"),
        bloque_texto(
            f"*Ventas totales:* {fmt_mxn(total_ventas)}\n"
            f"*Compras totales:* {fmt_mxn(total_compras)}\n"
            f"*% Costo general:* {semaforo(pct_general)} {fmt_pct(pct_general)} "
            f"(objetivo ≤{fmt_pct(OBJETIVO_COSTO)})"
        ),
        bloque_divisor(),
    ]

    # ── Áreas con ventas directas y objetivo 30% ──
    for area in AREAS_CON_OBJETIVO:
        compras         = compras_por_alma.get(area, 0)
        trans_recibidas = transferencias['recibidos'].get(area, 0)
        trans_enviadas  = transferencias['enviados'].get(area, 0)
        costo_total     = compras + trans_recibidas - trans_enviadas
        ventas          = ventas_area(area)
        pct             = costo_total / ventas if ventas else 0
        margen          = ventas * OBJETIVO_COSTO - costo_total
        encargado       = ENCARGADOS.get(area, '—')

        linea_pct = (
            f"{semaforo(pct)} {fmt_pct(pct)} "
            f"({'✅ dentro' if pct <= OBJETIVO_COSTO else '🚨 *REBASA* objetivo'})"
        )
        linea_margen = (
            f"Margen disp.: {fmt_mxn(margen)}" if margen >= 0
            else f"*Excedido: {fmt_mxn(-margen)}*"
        )
        linea_compras = f"Compras: {fmt_mxn(compras)}"
        if trans_recibidas or trans_enviadas:
            linea_compras += (
                f" +recib: {fmt_mxn(trans_recibidas)}"
                + (f" −env: {fmt_mxn(trans_enviadas)}" if trans_enviadas else "")
                + f" = {fmt_mxn(costo_total)}"
            )
        bloques.append(bloque_texto(
            f"*{area}* — _{encargado}_\n"
            f"Ventas: {fmt_mxn(ventas)} · {linea_compras}\n"
            f"% Costo: {linea_pct} · {linea_margen}"
        ))

    # ── Áreas informativas (sin ventas directas — transfieren) ──
    hay_info = any(
        compras_por_alma.get(a, 0) > 0 or transferencias['enviados'].get(a, 0) > 0
        for a in AREAS_INFORMATIVAS
    )
    if hay_info:
        bloques.append(bloque_divisor())
        bloques.append(bloque_texto("*Almacenes operativos* _(sin venta directa)_"))
        for area in AREAS_INFORMATIVAS:
            compras   = compras_por_alma.get(area, 0)
            transferido = transferencias['enviados'].get(area, 0)
            encargado = ENCARGADOS.get(area, '—')
            lineas = [f"*{area}* — _{encargado}_\nCompras: {fmt_mxn(compras)}"]
            if transferido:
                pct_t = compras / transferido if transferido else 0
                lineas.append(f"Transferencias enviadas: {fmt_mxn(transferido)} · % costo: {fmt_pct(pct_t)}")
            else:
                lineas.append("_Transferencias: sin datos aún_")
            bloques.append(bloque_texto("\n".join(lineas)))

    # ── Artículos próximos a vencer (≤ 5 días) ──
    por_vencer = [
        art for art in inv_actual.get('TODOS', [])
        if 0 < art['dias_vencimiento'] <= 5
    ]
    por_vencer.sort(key=lambda x: x['dias_vencimiento'])
    if por_vencer:
        lineas = ["*⏰ Artículos próximos a vencer:*"]
        for art in por_vencer[:8]:
            d = int(art['dias_vencimiento'])
            lineas.append(
                f"  • {art['nombre']} — {art['stock']} {art['um']} — "
                f"*{d} {'día' if d == 1 else 'días'}*"
            )
        bloques.append(bloque_divisor())
        bloques.append(bloque_texto("\n".join(lineas)))

    slack_post(CANAL_COSTOS, f"Reporte semanal de costos {semana_label}", bloques)
    print(f"  Reporte semanal enviado. Ventas: {fmt_mxn(total_ventas)} | Compras: {fmt_mxn(total_compras)} | %: {fmt_pct(pct_general)}")


# ── Reporte mensual ─────────────────────────────────────────────────────────

def reporte_mensual(d0: date, d1: date) -> None:
    mes_slug = d0.strftime('%Y%m')
    mo = f"{d0.month:02d}"
    mes_nombre = f"{MESES[mo]} {d0.year}"
    print(f"\n→ Reporte mensual {mes_nombre}")

    ventas_por_tipo  = read_ventas(d0, d1)
    compras_por_alma = read_compras(d0, d1)
    mermas_por_alma  = read_mermas_mensual(d0, d1)
    inv_cerrado      = read_inventario_cerrado(mes_slug)

    total_ventas  = sum(ventas_por_tipo.values())
    total_compras = sum(compras_por_alma.values())
    total_mermas  = sum(mermas_por_alma.values())
    pct_compras   = total_compras / total_ventas if total_ventas else 0
    pct_mermas    = total_mermas  / total_ventas if total_ventas else 0
    pct_costo     = (total_compras + total_mermas) / total_ventas if total_ventas else 0

    # ── Resumen general ──
    bloques = [
        bloque_texto(f"*Cierre mensual — {mes_nombre}*"),
        bloque_texto(
            f"*Ventas totales:* {fmt_mxn(total_ventas)}\n"
            f"*Compras totales:* {fmt_mxn(total_compras)} ({fmt_pct(pct_compras)})\n"
            f"*Mermas totales:* {fmt_mxn(total_mermas)} ({fmt_pct(pct_mermas)})\n"
            f"*Costo total (compras + mermas):* {semaforo(pct_costo)} "
            f"{fmt_mxn(total_compras + total_mermas)} ({fmt_pct(pct_costo)})\n"
            f"*Objetivo:* ≤{fmt_pct(OBJETIVO_COSTO)}"
        ),
        bloque_divisor(),
    ]

    # ── Detalle por área ──
    for area in ('COCINA', 'BARRA', 'CAVA', 'SALUMERIA'):
        compras = compras_por_alma.get(area, 0)
        mermas  = mermas_por_alma.get(area, 0)
        costo   = compras + mermas
        pct     = costo / total_ventas if total_ventas else 0

        lineas_inv = []
        if area in inv_cerrado:
            n_arts = len(inv_cerrado[area])
            lineas_inv.append(f"Inventario cerrado: {n_arts} artículos registrados")

        bloques.append(bloque_texto(
            f"*{area}*\n"
            f"Compras: {fmt_mxn(compras)} · Mermas: {fmt_mxn(mermas)}\n"
            f"Costo total: {semaforo(pct)} {fmt_mxn(costo)} ({fmt_pct(pct)})\n" +
            ("\n".join(lineas_inv) if lineas_inv else "")
        ))

    # ── Nota sobre auditoría de inventario ──
    if inv_cerrado:
        bloques.append(bloque_divisor())
        bloques.append(bloque_texto(
            "_La auditoría completa (calculado vs físico) estará disponible "
            "cuando el reporte de consumo mensual esté activo._"
        ))

    slack_post(CANAL_COSTOS, f"Cierre mensual {mes_nombre}", bloques)
    print(f"  Reporte mensual enviado. Costo general: {fmt_pct(pct_costo)}")


# ── Main ─────────────────────────────────────────────────────────────────────

def semana_actual() -> tuple[date, date]:
    """Retorna (lunes, domingo) de la semana actual.
    Usado para el cierre del domingo en la noche: la semana que acaba de terminar."""
    hoy = date.today()
    lunes = hoy - timedelta(days=hoy.weekday())
    domingo = lunes + timedelta(days=6)
    return lunes, domingo


def mes_anterior() -> tuple[date, date]:
    """Retorna (primer día, último día) del mes anterior."""
    hoy = date.today()
    ultimo = hoy.replace(day=1) - timedelta(days=1)
    primero = ultimo.replace(day=1)
    return primero, ultimo


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--semanal',  action='store_true')
    parser.add_argument('--mensual',  action='store_true')
    parser.add_argument('--desde',    help='YYYY-MM-DD')
    parser.add_argument('--hasta',    help='YYYY-MM-DD')
    args = parser.parse_args()

    if not args.semanal and not args.mensual:
        parser.error('Especifica --semanal y/o --mensual')

    from datetime import datetime

    if args.semanal:
        if args.desde and args.hasta:
            d0 = datetime.strptime(args.desde, '%Y-%m-%d').date()
            d1 = datetime.strptime(args.hasta, '%Y-%m-%d').date()
        else:
            d0, d1 = semana_actual()
        reporte_semanal(d0, d1)

    if args.mensual:
        if args.desde and args.hasta:
            d0 = datetime.strptime(args.desde, '%Y-%m-%d').date()
            d1 = datetime.strptime(args.hasta, '%Y-%m-%d').date()
        else:
            d0, d1 = mes_anterior()
        reporte_mensual(d0, d1)


if __name__ == '__main__':
    main()
