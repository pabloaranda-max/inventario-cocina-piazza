#!/usr/bin/env python3
"""Cifras canónicas de julio 2026. Única fuente para todos los entregables.

Periodo: 30/06/2026 → 31/07/2026 para los seis almacenes.

COCINA y ALIMENTARI se reportaron partidos en dos aplicaciones porque un
inventario semanal quedó guardado como mensual, lo que truncó el periodo
mensual al 08/07. Aquí se reconstruye el mes completo desde los saldos:

    costo del mes = inventario 30/06 + compras de todo julio − inventario 31/07

Ese cálculo es exacto e independiente del saldo intermedio, que en COCINA
además está roto: el primer reporte cierra el 08/07 11:10:43 con $86,967.53
y el segundo abre el mismo instante con $99,817.79. Sumar los dos reportes
sobreestima el consumo en esos $12,850.26; encadenar por saldos lo evita.
"""
from datetime import datetime

FIN = datetime(2026, 7, 31, 23, 59)
INICIO_MES = datetime(2026, 6, 30, 23, 59)

# almacén: (inv_inicial, compras_transf, inv_final, real, teorico, ventas_transf_neg, inicio)
ALM = {
    'GENERAL':    (208869.55, 141906.81, 177180.17, 173534.19,   6405.71,  142155.20, INICIO_MES),
    'COCINA':     ( 94131.66, 344747.48,  71369.04, 367510.10, 259459.18, 1278621.24, datetime(2026,6,30,21,39)),
    'BARRA':      (131712.27, 122980.61, 117423.79, 137269.09, 117605.54,  345647.46, INICIO_MES),
    'AMICI':      ( 90584.95,  81152.25,  95361.93,  76375.27,  24849.10,   81237.72, datetime(2026,6,30,21,45)),
    'CAVA':       (178936.49,  34079.75,  93466.75, 119436.99,  84995.12,  213241.64, INICIO_MES),
    'ALIMENTARI': ( 62819.02,   8704.31,  59657.61,  11865.72,  16271.28,   92501.53, datetime(2026,6,30,21,48)),
}

# los dos tramos de COCINA y ALIMENTARI, por si hace falta el detalle
TRAMOS = {
    'COCINA':     [(datetime(2026,6,30,21,39), datetime(2026,7,8,11,10), 111869.10,  49434.98,  226862.12),
                   (datetime(2026,7,8,11,10),  FIN,                      268491.26, 210024.20, 1051759.12)],
    'ALIMENTARI': [(datetime(2026,6,30,21,48), datetime(2026,7,8,14,57),   6547.43,   3725.14,   15383.33),
                   (datetime(2026,7,8,14,57),  FIN,                        5318.29,  12546.14,   77118.20)],
}
SALTO_COCINA = 12850.26          # discontinuidad de saldo el 08/07 11:10:43
NO_APLICA_PCT = {'GENERAL'}      # no vende: su % de costo no significa nada

SALUMERIA = dict(inicial=86786.51, compras=52311.75, final=76847.32,
                 real=62250.94, teorico=8188.37, brecha=54062.57)

DESPERDICIO = 112.50
CONSUMO_INTERNO = 62.00
VENTA_POS = 2344162.90           # detallado por producto, mes completo, 9 ambientes
VENTA_SIN_RECETA = 312945.48     # 73 productos con costo asociado $0.00
COSTO_POS = 515683.13            # costo por receta registrado en el punto de venta
RATIO_COSTEADOS = 0.2538793      # costo/venta de los 409 productos con receta
DIAS_MES = 31.0

XLS_TRANSFERENCIAS = 'Reporte de Transferencia entre Almacenes-Sat Aug 01 05_42_08 CST 2026.xls'
XLS_PRODUCTOS = 'Detallado por Producto-Sat Aug 01 04_59_00 CST 2026.xls'
XLS_AMBIENTES = 'Detallado por Producto-Sat Aug 01 05_07_25 CST 2026.xls'
XLS_VARIACIONES_GENERAL = 'Variaciones de Inventario - XTINV000285.xls'
XLS_VARIACIONES_COCINA = 'Variaciones de Inventario - XTINV000286.xls'
XLS_VARIACIONES_ALIMENTARI = 'Variaciones de Inventario - XTINV000288.xls'


def calcular(dir_descargas='/mnt/c/Users/P_ara/Downloads/'):
    """Devuelve un dict con todas las cifras derivadas, ya cuadradas."""
    import xlrd, collections

    def M(s):
        s = str(s).replace('$', '').replace(',', '').strip()
        n = s.startswith('-'); s = s.lstrip('-')
        try: v = float(s)
        except ValueError: v = 0.0
        return -v if n else v

    sh = xlrd.open_workbook(dir_descargas + XLS_TRANSFERENCIAS).sheets()[0]
    out = collections.defaultdict(float)
    inn = collections.defaultdict(float)
    intra = collections.defaultdict(float)
    perim = set(ALM)
    movs = 0
    for r in range(1, sh.nrows):
        v = [str(c.value) for c in sh.row(r)]
        o, d, c = v[1].strip(), v[2].strip(), M(v[11])
        out[o] += c; inn[d] += c; movs += 1
        if o in perim and d in perim:
            intra[o] += c

    filas = []
    for k, (ini, com, fin, real, teo, vt, d0) in ALM.items():
        neto = real - intra[k]
        venta = vt - out[k]
        dias = (FIN - d0).total_seconds() / 86400
        dinv = fin / (real / dias)
        filas.append(dict(
            alm=k, inicial=ini, compras=com, final=fin, real=real, intra=intra[k],
            neto=neto, teorico=teo, brecha=neto - teo, venta=venta, dias=dias,
            dias_inv=dinv, rot=365 / dinv,
            pct_real=None if k in NO_APLICA_PCT else neto / venta * 100,
            pct_teo=None if k in NO_APLICA_PCT else teo / venta * 100))
    filas.sort(key=lambda f: -f['brecha'])

    T = dict(
        inicial=sum(f['inicial'] for f in filas),
        compras=sum(f['compras'] for f in filas),
        final=sum(f['final'] for f in filas),
        real_bruto=sum(f['real'] for f in filas),
        intra=sum(intra.values()),
        neto=sum(f['neto'] for f in filas),
        teorico=sum(f['teorico'] for f in filas),
        venta=sum(f['venta'] for f in filas),
        transf_total=sum(out.values()), movimientos=movs)
    T['brecha'] = T['neto'] - T['teorico']
    T['pct_real'] = T['neto'] / T['venta'] * 100
    T['pct_teo'] = T['teorico'] / T['venta'] * 100
    T['pts'] = T['pct_real'] - T['pct_teo']
    T['dias_inv'] = T['final'] / (T['neto'] / DIAS_MES)
    T['rot'] = 365 / T['dias_inv']
    T['capital_dia'] = T['neto'] / DIAS_MES
    T['dif_venta'] = VENTA_POS - T['venta']
    T['pct_brecha_del_consumo'] = T['brecha'] / T['neto'] * 100
    T['costo_faltante'] = VENTA_SIN_RECETA * RATIO_COSTEADOS
    T['brecha_con_salumeria'] = T['brecha'] + SALUMERIA['brecha']

    # cuadres que deben cumplirse siempre
    assert abs((T['inicial'] + T['compras'] - T['final']
                - DESPERDICIO - CONSUMO_INTERNO) - T['real_bruto']) < 1.0
    assert abs(T['neto'] - (T['real_bruto'] - T['intra'])) < 0.01
    return filas, T, dict(out=out, inn=inn, intra=intra)


if __name__ == '__main__':
    filas, T, tr = calcular()
    print(f'{"ALMACEN":11s} {"neto":>11s} {"%real":>7s} {"teorico":>11s} {"brecha":>11s} {"dias":>6s}')
    for f in filas:
        pr = f'{f["pct_real"]:7.1f}' if f['pct_real'] else '      —'
        print(f'{f["alm"]:11s} {f["neto"]:11,.0f} {pr} {f["teorico"]:11,.0f} {f["brecha"]:11,.0f} {f["dias_inv"]:6.0f}')
    print(f'{"TOTAL":11s} {T["neto"]:11,.0f} {T["pct_real"]:7.1f} {T["teorico"]:11,.0f} {T["brecha"]:11,.0f} {T["dias_inv"]:6.0f}')
    print(f'\nventa atribuida {T["venta"]:,.0f} · POS {VENTA_POS:,.0f} · dif {T["dif_venta"]:,.0f} '
          f'(sin receta {VENTA_SIN_RECETA:,.0f})')
    print(f'cuadres OK · {T["movimientos"]} transferencias · capital/día ${T["capital_dia"]:,.0f}')
