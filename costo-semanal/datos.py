#!/usr/bin/env python3
"""Cifras canónicas del costo semanal. Única fuente para el reporte.

Periodo: 1 → 9 de agosto de 2026. Almacenes: COCINA, BARRA, EMPAQUE, MERCH.

    costo real     = inventario inicial + compras − inventario final
    costo de venta = costo real − merma

La regla del proyecto: **nada de cifras tecleadas salvo los inventarios.**
Compras, ventas y merma se leen de los archivos de Xetux en cada corrida. Un
reporte hecho a mano en agosto de 2026 omitió las siete líneas de compra de
empaque al transcribir, y el resultado fue un costo de empaque de −$26,125.50
que nadie notó: el costo total salió 25.05 % en vez de 38.26 %. Por eso aquí
las compras no se transcriben, y por eso `cuadrar()` revienta ante un costo
negativo antes de dejar publicar nada.
"""
import glob
import os

DIR_DESCARGAS = '/mnt/c/Users/P_ara/Downloads/'
PERIODO = ('1/08/26', '9/08/26')
ALMACENES = ('COCINA', 'BARRA', 'EMPAQUE', 'MERCH')

# Xetux nombra el empaque de dos formas según el reporte; se normaliza a EMPAQUE.
ALIAS = {'SUMINISTROS': 'EMPAQUE', 'EMPAQUE': 'EMPAQUE', 'COCINA': 'COCINA',
         'BARRA': 'BARRA', 'MERCH': 'MERCH'}

# Tipo de producto del POS → almacén que lo surte. El empaque no aparece: no
# vende, así que su costo se mide contra la venta total.
TIPO_ALM = {'1-ALIMENTOS': 'COCINA', '2-BEBIDAS': 'BARRA', '3-VINO': 'BARRA',
            '6-MERCH': 'MERCH'}
VENDEN = ('COCINA', 'BARRA', 'MERCH')

# ─── lo único que se edita a mano ────────────────────────────────────────────
# Totales de las tomas físicas, a último costo. Al cerrar la semana siguiente,
# se reemplazan estos ocho números y se vuelve a correr. Nada más.
INVENTARIOS = {              # almacén: (inicial, final)
    'COCINA':  (146041.64, 141816.94),
    'BARRA':   (47001.61,  40862.46),
    'EMPAQUE': (32447.50,  65340.50),
    'MERCH':   (90861.00,  89638.00),
}

# RESUELTO (11/08/2026): el inicial de BARRA es 47,001.61. El detalle de la toma
# XTINV000032 suma 47,001.62 al último costo y confirma la captura. La hoja del
# reporte manual daba 34,234.78 con los mismos 51 artículos pero cantidades
# distintas y mucho más bajas —agua mineral 1 pieza contra 148, colimita 0
# contra 60, coca regular 84 contra 252—, así que venía de otra toma o de un
# conteo parcial. Por eso su costo de barra salía por debajo de su teórico.
INICIAL_BARRA_ALTERNO = 34234.78          # descartado, se conserva para el contraste

# Provisional: el consumo teórico sale de la hoja del reporte manual porque no
# se ha bajado de Xetux como reporte propio. Es el consumo por explosión de
# recetas —lo que lo vendido debió gastar—, no `inicial + compras − final`, que
# es el real y ya se calcula aquí. Se comparan uno contra otro: la diferencia
# es la brecha.
TEORICO = {'COCINA': 101578.85, 'BARRA': 20071.85, 'EMPAQUE': 5087.90,
           'MERCH': 1753.00}

# No hubo transferencias entre almacenes en el periodo (confirmado por Pablo).
TRANSFERENCIAS = {}
# ─────────────────────────────────────────────────────────────────────────────


def _money(v):
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).replace('$', '').replace(',', '').strip() or 0)


def _ultimo(patron):
    """El archivo más reciente que empata el patrón, o revienta diciendo cuál falta."""
    hits = sorted(glob.glob(os.path.join(DIR_DESCARGAS, patron)),
                  key=os.path.getmtime, reverse=True)
    if not hits:
        raise SystemExit(f'falta el reporte «{patron}» en {DIR_DESCARGAS}')
    return hits[0]


def _hoja(ruta):
    import xlrd
    sh = xlrd.open_workbook(ruta).sheet_by_index(0)
    hdr = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
    filas = [{hdr[c]: sh.cell_value(r, c) for c in range(sh.ncols)}
             for r in range(1, sh.nrows)]
    return hdr, filas


def leer_compras():
    """Compras por almacén, del reporte detallado. Exige la columna Almacén.

    Se agrupa por F. Recepción, no por F. Documento: el inventario mide lo que
    está en el anaquel. El reporte manual filtró por documento y perdió una
    entrada de $206 recibida el 1/08 con factura del 30/07.
    """
    ruta = _ultimo('Reporte Detallado de Compras*.xls')
    hdr, filas = _hoja(ruta)
    if 'Almacén' not in hdr:
        raise SystemExit(
            f'«{os.path.basename(ruta)}» no trae columna Almacén.\n'
            '   Vuelve a bajarlo de Xetux con el desglose por almacén activado.')
    if 'F. Recepción' not in hdr:
        raise SystemExit(f'«{os.path.basename(ruta)}» no trae F. Recepción.')
    por_alm = dict.fromkeys(ALMACENES, 0.0)
    desconocidos, total = set(), 0.0
    for f in filas:
        alm = ALIAS.get(str(f['Almacén']).strip().upper())
        imp = _money(f['Subtotal'])
        total += imp
        if alm is None:
            desconocidos.add(str(f['Almacén']))
        else:
            por_alm[alm] += imp
    if desconocidos:
        raise SystemExit(f'almacén no reconocido en compras: {sorted(desconocidos)}')
    assert abs(sum(por_alm.values()) - total) < 0.01, 'se perdieron líneas al agrupar'
    return por_alm, total, os.path.basename(ruta), len(filas)


def leer_desperdicios():
    """Merma por almacén, del reporte de desperdicios. Sólo folios APLICADO.

    Se valoriza con «Costo Total» (último costo) para que case con los
    inventarios, que también van a último costo. El reporte manual sumó a mano
    y se quedó en 12,762.35, y su resumen sólo llevó 5,137.35 de los 17,556.54
    reales: le faltaba más de la mitad de la merma de cocina.
    """
    ruta = _ultimo('Desperdicios*.xls')
    hdr, filas = _hoja(ruta)
    for col in ('Almacén', 'Costo Total', 'Estatus'):
        if col not in hdr:
            raise SystemExit(f'«{os.path.basename(ruta)}» no trae columna {col}.')
    por_alm = dict.fromkeys(ALMACENES, 0.0)
    desconocidos, n = set(), 0
    for f in filas:
        if str(f['Estatus']).strip().upper() != 'APLICADO':
            continue
        alm = ALIAS.get(str(f['Almacén']).strip().upper())
        if alm is None:
            desconocidos.add(str(f['Almacén']))
        else:
            por_alm[alm] += _money(f['Costo Total'])
            n += 1
    if desconocidos:
        raise SystemExit(f'almacén no reconocido en desperdicios: {sorted(desconocidos)}')
    return por_alm, os.path.basename(ruta), n


def leer_ventas():
    """Venta neta y costo del POS, del detallado por producto.

    Devuelve además la venta atribuida a cada almacén: la del POS corregida por
    los dos casos donde el almacén que pone el costo no es el que se lleva el
    ingreso. Ver `base_economica()`.
    """
    ruta = _ultimo('Detallado por Producto*.xls')
    _, filas = _hoja(ruta)
    neta = sum(_money(f['Venta Neta']) for f in filas)
    desc = sum(_money(f['Descuento']) for f in filas)
    costo_pos = sum(_money(f['Ultimo Costo']) for f in filas)

    pos = dict.fromkeys(ALMACENES, 0.0)
    for f in filas:
        alm = TIPO_ALM.get(str(f['Tipo de Producto']).strip())
        if alm:
            pos[alm] += _money(f['Venta Neta'])

    postres = sum(_money(f['Venta Neta']) for f in filas
                  if str(f['Familia']).strip() == 'POSTRES')
    ens = [f for f in filas if 'ENSAMBLE' in str(f['Producto']).upper()]
    ens_venta = sum(_money(f['Venta Neta']) for f in ens)
    ens_costo = sum(_money(f['Ultimo Costo']) for f in ens)
    # Componentes de combo: llevan costo pero su ingreso se registra en el padre.
    combo = sum(_money(f['Ultimo Costo']) for f in filas
                if _money(f['Venta Neta']) == 0 and _money(f['Ultimo Costo']) > 0)
    return dict(neta=neta, descuentos=desc, costo_pos=costo_pos, combo=combo,
                pos=pos, postres=postres, ens_venta=ens_venta, ens_costo=ens_costo,
                archivo=os.path.basename(ruta), lineas=len(filas))


def base_economica(v):
    """Venta atribuida a cada almacén, para el % de costo.

    El POS registra el ingreso donde se cobra, no donde salió el producto. Dos
    correcciones, ambas a favor de barra:

    1. **Postres.** Se venden como 1-ALIMENTOS (cocina) pero se producen con
       insumos de barra: base de helado, siropes, galleta. La venta se acredita
       a barra, que es quien pone el costo.
    2. **Combos.** Cada ENSAMBLE lleva bebida —601 bebidas para 600 combos
       comiendo aquí, 23 y 23 para llevar—, y el ingreso completo se registra en
       el producto padre, que es de cocina. El ingreso del combo se reparte
       entre las dos en proporción a lo que cada una pone de costo.

    El reparto por costo mantiene el total cuadrado con la venta neta, cosa que
    no pasaría valorizando la bebida a precio de menú.
    """
    base = dict(v['pos'])
    base['COCINA'] -= v['postres']
    base['BARRA'] += v['postres']
    total_combo = v['ens_costo'] + v['combo']
    if total_combo:
        parte_barra = v['ens_venta'] * v['combo'] / total_combo
        base['COCINA'] -= parte_barra
        base['BARRA'] += parte_barra
    return base


def cuadrar(inicial_barra=None):
    """Devuelve las cifras ya validadas. Revienta si algo no cierra."""
    compras, total_compras, arch_c, n_compras = leer_compras()
    merma, arch_m, n_merma = leer_desperdicios()
    v = leer_ventas()

    inv = dict(INVENTARIOS)
    if inicial_barra is not None:
        inv['BARRA'] = (inicial_barra, inv['BARRA'][1])

    # ── defensa 1: ningún almacén de los archivos puede faltar en el cuadro ──
    con_movimiento = {a for a, x in compras.items() if x} | {a for a, x in merma.items() if x}
    faltan = con_movimiento - set(inv)
    if faltan:
        raise SystemExit(f'hay movimiento en {sorted(faltan)} sin inventario capturado')

    filas = {}
    for a in ALMACENES:
        ini, fin = inv[a]
        real = ini + compras[a] - fin
        filas[a] = dict(inicial=ini, compras=compras[a], final=fin, real=real,
                        merma=merma[a], venta=real - merma[a], teorico=TEORICO[a])

    # ── defensa 2: un costo negativo es imposible ───────────────────────────
    for a, f in filas.items():
        if f['real'] < 0:
            raise SystemExit(
                f'costo real negativo en {a}: {f["real"]:,.2f}\n'
                f'   inicial {f["inicial"]:,.2f} + compras {f["compras"]:,.2f} '
                f'− final {f["final"]:,.2f}\n'
                '   casi siempre significa compras sin cargar para ese almacén.')

    # ── defensa 3: los agregados tienen que reconstruirse desde las filas ────
    T = dict(
        compras=total_compras,
        real=sum(f['real'] for f in filas.values()),
        merma=sum(f['merma'] for f in filas.values()),
        venta_costo=sum(f['venta'] for f in filas.values()),
        teorico=sum(f['teorico'] for f in filas.values()),
        venta=v['neta'],
    )
    assert abs(T['compras'] - sum(f['compras'] for f in filas.values())) < 0.01
    assert abs(T['real'] - T['merma'] - T['venta_costo']) < 0.01
    T['brecha'] = T['venta_costo'] - T['teorico']
    T['pct_real'] = T['real'] / T['venta'] * 100
    T['pct_venta'] = T['venta_costo'] / T['venta'] * 100
    T['pct_teorico'] = T['teorico'] / T['venta'] * 100
    T['pct_merma'] = T['merma'] / T['venta'] * 100

    # empaque no vende: se mide aparte, como % de la venta total
    emp = filas['EMPAQUE']['real']
    T['empaque'] = emp
    T['pct_empaque'] = emp / T['venta'] * 100
    T['mercancia'] = T['real'] - emp
    T['pct_mercancia'] = T['mercancia'] / T['venta'] * 100

    # ── venta atribuida y % de costo por almacén ────────────────────────────
    base = base_economica(v)
    assert abs(sum(base[a] for a in VENDEN) - T['venta']) < 0.01, \
        'la venta atribuida no suma la venta neta'
    for a in VENDEN:
        f = filas[a]
        f['base'] = base[a]
        f['pct_real'] = f['real'] / base[a] * 100
        f['pct_venta'] = f['venta'] / base[a] * 100
        f['pct_teorico'] = f['teorico'] / base[a] * 100
    e = filas['EMPAQUE']
    e['base'] = T['venta']                 # no vende: contra la venta total
    e['pct_real'] = e['real'] / T['venta'] * 100
    e['pct_venta'] = e['venta'] / T['venta'] * 100
    e['pct_teorico'] = e['teorico'] / T['venta'] * 100
    T['base_pos'] = v['pos']
    T['ajuste_postres'] = v['postres']
    T['ajuste_combo'] = v['ens_venta'] * v['combo'] / (v['ens_costo'] + v['combo'])

    T['fuentes'] = dict(compras=arch_c, n_compras=n_compras,
                        ventas=v['archivo'], n_ventas=v['lineas'],
                        merma=arch_m, n_merma=n_merma)
    T['combo'] = v['combo']
    T['descuentos'] = v['descuentos']
    T['costo_pos'] = v['costo_pos']
    return filas, T


if __name__ == '__main__':
    filas, T = cuadrar()
    print(f'costo real {T["real"]:,.2f} ({T["pct_real"]:.2f} %) · '
          f'costo de venta {T["venta_costo"]:,.2f} ({T["pct_venta"]:.2f} %) · '
          f'brecha {T["brecha"]:+,.2f}')
