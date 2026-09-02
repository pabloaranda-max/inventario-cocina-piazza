#!/usr/bin/env python3
"""Rellena la plantilla del reporte de costo con datos y activos incrustados."""
import xlrd, collections, base64, html, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos as _d, tokens as _tk

D = '/mnt/c/Users/P_ara/Downloads/'
HEAD = '/home/lilp/proyectos/reportes-inventario/costo.head.html'
BODY = '/home/lilp/proyectos/reportes-inventario/costo.body.html'
OUT = '/home/lilp/proyectos/reporte-costo-julio-2026.html'
XLSX = '/home/lilp/proyectos/costo-inventario-julio-2026.xlsx'
FONT = '/home/lilp/proyectos/branding/fonts/FreightNeo W03 Book.ttf'

def M(s):
    s = str(s).replace('$', '').replace(',', '').strip()
    neg = s.startswith('-'); s = s.lstrip('-')
    try: v = float(s)
    except ValueError: v = 0.0
    return -v if neg else v

def N(s):
    try: return float(str(s).replace(',', '').strip())
    except ValueError: return 0.0

def rows_of(f):
    sh = xlrd.open_workbook(D + f).sheets()[0]
    return [[str(c.value) for c in sh.row(r)] for r in range(sh.nrows)]

def mx(v, dec=0):
    return f'${v:,.{dec}f}' if v >= 0 else f'−${abs(v):,.{dec}f}'

ALM = {
    'GENERAL':    (208869.55, 141906.81, 177180.17, 173534.19,   6405.71,  142155.20, '30/06'),
    'COCINA':     ( 94131.66, 344747.48,  71369.04, 367510.10, 259459.18, 1278621.24, '30/06'),
    'BARRA':      (131712.27, 122980.61, 117423.79, 137269.09, 117605.54,  345647.46, '30/06'),
    'AMICI':      ( 90584.95,  81152.25,  95361.93,  76375.27,  24849.10,   81237.72, '30/06'),
    'CAVA':       (178936.49,  34079.75,  93466.75, 119436.99,  84995.12,  213241.64, '30/06'),
    'ALIMENTARI': ( 62819.02,   8704.31,  59657.61,  11865.72,  16271.28,   92501.53, '30/06'),
}
PERIM = set(ALM)

TR = [dict(orig=v[1].strip(), dest=v[2].strip(), costo=M(v[11]))
      for v in rows_of('Reporte de Transferencia entre Almacenes-Sat Aug 01 05_42_08 CST 2026.xls')[1:]]
intra = collections.defaultdict(float); out = collections.defaultdict(float); inn = collections.defaultdict(float)
for t in TR:
    out[t['orig']] += t['costo']; inn[t['dest']] += t['costo']
    if t['orig'] in PERIM and t['dest'] in PERIM:
        intra[t['orig']] += t['costo']
TI = sum(intra.values())

GEN = [dict(grupo=v[1].strip(), fin=N(v[13]), cur=M(v[16]))
       for v in rows_of('Variaciones de Inventario - XTINV000285.xls')[1:]]
gen_g = collections.defaultdict(float)
for x in GEN:
    gen_g[x['grupo']] += x['cur']
resid = sum(x['cur'] for x in GEN)

PROD = [dict(nom=v[2].strip(), cant=N(v[3]), venta=M(v[5]), cprom=M(v[13]))
        for v in rows_of('Detallado por Producto-Sat Aug 01 04_59_00 CST 2026.xls')[1:]]
SIN = sorted([p for p in PROD if p['cprom'] == 0 and p['venta'] > 0], key=lambda x: -x['venta'])
CON = [p for p in PROD if p['cprom'] > 0]
RATIO = sum(p['cprom'] for p in CON) / sum(p['venta'] for p in CON)

AMB = collections.defaultdict(lambda: [0.0, 0.0])
for v in rows_of('Detallado por Producto-Sat Aug 01 05_07_25 CST 2026.xls')[1:]:
    AMB[v[2].strip()][0] += M(v[8]); AMB[v[2].strip()][1] += M(v[16])
VENTA = sum(p['venta'] for p in PROD)
COSTO = sum(p['cprom'] for p in PROD)

# ---------------------------------------------------------------- barras almacén
brechas = []
for k in ALM:
    neto = ALM[k][3] - intra[k]
    brechas.append((k, neto - ALM[k][4], ALM[k][3], intra[k], neto, ALM[k][4], ALM[k][5], ALM[k][6]))
brechas.sort(key=lambda x: -x[1])
mxv = max(b[1] for b in brechas)
bars_alm = []
for k, br, real, itr, neto, teo, den_raw, desde in brechas:
    den = 0 if k == 'GENERAL' else den_raw - out[k]
    pct = f'{neto/den*100:.1f} %' if den > 1000 else '—'
    w = max(0.0, min(100.0, abs(br) / mxv * 100))
    cl = 'fill' if br >= 0 else 'fill is-neg'
    fill = f'<div class="{cl}" style="width:{w:.1f}%"></div>'
    cls = '' if br >= 0 else ' class="pos"'
    bars_alm.append(
        f'<div class="bar" title="{k}: brecha {mx(br)} · costo real neto {mx(neto)} · teórico {mx(teo)}">'
        f'<div class="lbl">{k}<small>desde {desde} · {pct}</small></div>'
        f'<div class="track">{fill}</div>'
        f'<div class="val"{cls}>{mx(br)}</div></div>')

rows_alm = []
for k, br, real, itr, neto, teo, den_raw, desde in brechas:
    den = 0 if k == 'GENERAL' else den_raw - out[k]
    pct = f'{neto/den*100:.1f}' if den > 1000 else '<span class="dim">n/a</span>'
    cls = ' class="neg"' if br >= 0 else ' class="pos"'
    rows_alm.append(
        f'<tr><td>{k}</td><td class="dim">{desde}</td><td>{real:,.0f}</td>'
        f'<td class="dim">{("−"+format(itr,",.0f")) if itr else "—"}</td><td>{neto:,.0f}</td>'
        f'<td>{teo:,.0f}</td><td{cls}>{mx(br)}</td><td>{pct}</td></tr>')
tot_br = sum(b[1] for b in brechas)
rows_alm.append(
    f'<tr class="total"><td>TOTAL</td><td></td><td>{sum(ALM[k][3] for k in ALM):,.0f}</td>'
    f'<td>−{TI:,.0f}</td><td>{sum(ALM[k][3] for k in ALM)-TI:,.0f}</td>'
    f'<td>{sum(ALM[k][4] for k in ALM):,.0f}</td><td class="neg">{mx(tot_br)}</td><td></td></tr>')

# ---------------------------------------------------------------- barras GENERAL
LBL = {'EMPAQUE': ('EMPAQUE', 'desechables · 80 de 86 códigos sin contar'),
       'ABARROTES': ('ABARROTES', '30 de 190 códigos sin contar'),
       'CERVEZA Y REFRESCO': ('CERVEZA Y REFRESCO', '3 de 16 códigos sin contar'),
       'CARNES': ('FUNDA FIBROSA', 'consumible de producción, grupo CARNES')}
# solo los grupos que APORTAN al residuo; el resto (incluidos los negativos) se agrupa.
# Nunca pasar un ancho negativo a CSS: el navegador lo ignora y la barra sale al 100 %.
gsel = [(k, v) for k, v in sorted(gen_g.items(), key=lambda kv: -kv[1]) if v > 1000]
n_resto = len(gen_g) - len(gsel)
otros = resid - sum(v for _, v in gsel)
mxg = max(v for _, v in gsel)
bars_gen = []
for k, v in gsel:
    nm, sub = LBL.get(k, (k, ''))
    w = max(0.0, v / mxg * 100)
    bars_gen.append(
        f'<div class="bar" title="{nm}: {mx(v)} — {v/resid*100:.1f} % del residuo de GENERAL">'
        f'<div class="lbl">{nm}<small>{sub}</small></div>'
        f'<div class="track"><div class="fill" style="width:{w:.1f}%"></div></div>'
        f'<div class="val">{mx(v)}<br><span class="dim" style="font-size:11px">{v/resid*100:.0f} %</span></div></div>')
bars_gen.append(
    f'<div class="bar" title="Resto: {n_resto} grupos que se compensan entre sí, neto {mx(otros)}">'
    f'<div class="lbl">resto<small>{n_resto} grupos · se compensan entre sí</small></div>'
    f'<div class="track"><div class="fill is-neg" style="width:2%"></div></div>'
    f'<div class="val dim">{mx(otros)}</div></div>')

# ---------------------------------------------------------------- botones
rows_btn = []
for p in SIN[:10]:
    rows_btn.append(f'<tr><td>{html.escape(p["nom"])}</td><td>{p["cant"]:,.0f}</td>'
                    f'<td>{p["venta"]:,.0f}</td><td class="dim">~{p["venta"]*RATIO:,.0f}</td></tr>')
rows_btn.append(f'<tr class="total"><td>Los 73, completos</td><td>{sum(p["cant"] for p in SIN):,.0f}</td>'
                f'<td>{sum(p["venta"] for p in SIN):,.0f}</td>'
                f'<td>~{sum(p["venta"] for p in SIN)*RATIO:,.0f}</td></tr>')

# ---------------------------------------------------------------- ambientes
rows_amb = []
for a, (v, c) in sorted(AMB.items(), key=lambda kv: -kv[1][0]):
    hi = ' class="neg"' if v and c / v * 100 < 15 else ''
    rows_amb.append(f'<tr><td>{a.title()}</td><td>{v:,.0f}</td><td>{c:,.0f}</td>'
                    f'<td{hi}>{c/v*100:.1f}</td></tr>')
rows_amb.append(f'<tr class="total"><td>TOTAL</td><td>{VENTA:,.0f}</td><td>{COSTO:,.0f}</td>'
                f'<td>{COSTO/VENTA*100:.1f}</td></tr>')

# ---------------------------------------------------------------- trazabilidad
TRZ = {'GENERAL': 141906.81, 'COCINA': 344747.48, 'BARRA': 122980.61, 'AMICI': 81152.25,
       'SALUMERIA': 52311.75, 'CAVA': 34079.75, 'ALIMENTARI': 8704.31}
rows_trz = []
for k, comp in sorted(TRZ.items(), key=lambda kv: -kv[1]):
    rec = inn.get(k, 0.0)
    rows_trz.append(f'<tr><td>{k}</td><td>{comp:,.0f}</td>'
                    f'<td class="dim">{("−"+format(rec,",.0f")) if rec else "—"}</td>'
                    f'<td>{comp-rec:,.0f}</td></tr>')

# ---------------------------------------------------------------- ensamblar
tpl = open(HEAD, encoding='utf-8').read() + open(BODY, encoding='utf-8').read()
_f, _T, _x = _d.calcular()
tpl = _tk.render(tpl, _tk.construir(_f, _T), 'costo.body.html')
font_b64 = base64.b64encode(open(FONT, 'rb').read()).decode()
xlsx_b64 = base64.b64encode(open(XLSX, 'rb').read()).decode()
kb = round(len(open(XLSX, 'rb').read()) / 1024)

page = (tpl
        .replace('__FONT__', font_b64)
        .replace('__XLSX__', xlsx_b64)
        .replace('__KB__', str(kb))
        .replace('__BARS_ALM__', '\n'.join(bars_alm))
        .replace('__ROWS_ALM__', '\n'.join(rows_alm))
        .replace('__BARS_GEN__', '\n'.join(bars_gen))
        .replace('__ROWS_BTN__', '\n'.join(rows_btn))
        .replace('__ROWS_AMB__', '\n'.join(rows_amb))
        .replace('__ROWS_TRZ__', '\n'.join(rows_trz)))

open(OUT, 'w', encoding='utf-8').write(page)
print('escrito', OUT, f'{len(page)/1024:.0f} KB')
assert '__' not in page.replace('__', '', 0) or True
for tok in ['__FONT__', '__XLSX__', '__KB__', '__BARS_ALM__', '__ROWS_ALM__', '__BARS_GEN__', '__ROWS_BTN__', '__ROWS_AMB__', '__ROWS_TRZ__']:
    assert tok not in page, f'sin sustituir: {tok}'
print('placeholders: todos sustituidos')
print(f'brecha total {tot_br:,.2f} | residuo GENERAL {resid:,.2f} | botones {len(SIN)}')
