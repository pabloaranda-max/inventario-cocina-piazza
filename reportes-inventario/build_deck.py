#!/usr/bin/env python3
"""Arma las presentaciones autocontenidas con la estética del resumen ejecutivo."""
import xlrd, collections, base64, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos as _d, tokens as _tk

S = '/home/lilp/proyectos/reportes-inventario/'
D = '/mnt/c/Users/P_ara/Downloads/'
XLSX = '/home/lilp/proyectos/costo-inventario-julio-2026.xlsx'

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

# ------------------------------------------------------------------ datos
ALM = {
    'GENERAL':    (173534.19,   6405.71,  142155.20),
    'COCINA':     (367510.10, 259459.18, 1278621.24),
    'BARRA':      (137269.09, 117605.54,  345647.46),
    'AMICI':      ( 76375.27,  24849.10,   81237.72),
    'CAVA':       (119436.99,  84995.12,  213241.64),
    'ALIMENTARI': ( 11865.72,  16271.28,   92501.53),
}
PERIM = set(ALM)
TR = [dict(orig=v[1].strip(), dest=v[2].strip(), costo=M(v[11]))
      for v in rows_of('Reporte de Transferencia entre Almacenes-Sat Aug 01 05_42_08 CST 2026.xls')[1:]]
intra = collections.defaultdict(float); out = collections.defaultdict(float); inn = collections.defaultdict(float)
for t in TR:
    out[t['orig']] += t['costo']; inn[t['dest']] += t['costo']
    if t['orig'] in PERIM and t['dest'] in PERIM:
        intra[t['orig']] += t['costo']

PROD = [dict(nom=v[2].strip(), cant=N(v[3]), venta=M(v[5]), cprom=M(v[13]))
        for v in rows_of('Detallado por Producto-Sat Aug 01 04_59_00 CST 2026.xls')[1:]]
SIN = sorted([p for p in PROD if p['cprom'] == 0 and p['venta'] > 0], key=lambda x: -x['venta'])
CON = [p for p in PROD if p['cprom'] > 0]
RATIO = sum(p['cprom'] for p in CON) / sum(p['venta'] for p in CON)
VENTA = sum(p['venta'] for p in PROD)

AMB = collections.defaultdict(lambda: [0.0, 0.0])
for v in rows_of('Detallado por Producto-Sat Aug 01 05_07_25 CST 2026.xls')[1:]:
    AMB[v[2].strip()][0] += M(v[8]); AMB[v[2].strip()][1] += M(v[16])

# ------------------------------------------------------------------ filas
rows_alm = []
orden = sorted(ALM, key=lambda k: -(ALM[k][0] - intra[k] - ALM[k][1]))
for k in orden:
    neto = ALM[k][0] - intra[k]; br = neto - ALM[k][1]
    den = 0 if k == 'GENERAL' else ALM[k][2] - out[k]
    pct = f'{neto/den*100:.1f} %' if den > 1000 else '—'
    col = 'var(--green)' if br < 0 else ('var(--red)' if br > 40000 else 'var(--ink)')
    rows_alm.append(
        f'<div>{k}</div><div class="mono">{neto:,.0f}</div><div class="mono">{ALM[k][1]:,.0f}</div>'
        f'<div class="mono" style="color:{col}">{"−" if br<0 else ""}${abs(br):,.0f}</div>'
        f'<div class="mono">{pct}</div>')
TOT_R = sum(ALM[k][0] for k in ALM) - sum(intra.values())
TOT_T = sum(ALM[k][1] for k in ALM)
TOT_V = sum(ALM[k][2] for k in ALM) - sum(out[k] for k in PERIM)
rows_alm.append(f'<div><b>TOTAL</b></div><div class="mono"><b>{TOT_R:,.0f}</b></div>'
                f'<div class="mono"><b>{TOT_T:,.0f}</b></div>'
                f'<div class="mono"><b>${TOT_R-TOT_T:,.0f}</b></div>'
                f'<div class="mono"><b>{TOT_R/TOT_V*100:.1f} %</b></div>')

rows_btn = []
for p in SIN[:8]:
    rows_btn.append(f'<div>{p["nom"].title()}</div><div class="mono">{p["cant"]:,.0f}</div>'
                    f'<div class="mono">${p["venta"]:,.0f}</div>'
                    f'<div class="mono" style="color:var(--dim)">~{p["venta"]*RATIO:,.0f}</div>')
TS = sum(p['venta'] for p in SIN)
rows_btn.append(f'<div><b>Los 73 productos</b></div><div class="mono"><b>{sum(p["cant"] for p in SIN):,.0f}</b></div>'
                f'<div class="mono"><b>${TS:,.0f}</b></div><div class="mono"><b>~{TS*RATIO:,.0f}</b></div>')

rows_amb = []
for a, (v, c) in sorted(AMB.items(), key=lambda kv: -kv[1][0]):
    col = ' style="color:var(--red)"' if v and c / v * 100 < 15 else ''
    rows_amb.append(f'<div>{a.title()}</div><div class="mono">${v:,.0f}</div>'
                    f'<div class="mono">{c:,.0f}</div><div class="mono"{col}>{c/v*100:.1f} %</div>')
rows_amb.append(f'<div><b>TOTAL</b></div><div class="mono"><b>${sum(x[0] for x in AMB.values()):,.0f}</b></div>'
                f'<div class="mono"><b>{sum(x[1] for x in AMB.values()):,.0f}</b></div>'
                f'<div class="mono"><b>22.0 %</b></div>')

TRZ = {'GENERAL': 141906.81, 'COCINA': 344747.48, 'BARRA': 122980.61, 'AMICI': 81152.25,
       'SALUMERIA': 52311.75, 'CAVA': 34079.75, 'ALIMENTARI': 8704.31}
rows_trz = []
for k, comp in sorted(TRZ.items(), key=lambda kv: -kv[1]):
    rec = inn.get(k, 0.0)
    rows_trz.append(f'<div class="cost-line"><span>{k}</span>'
                    f'<b class="mono">${comp:,.0f} − {rec:,.0f} = {comp-rec:,.0f}</b></div>')

# ------------------------------------------------------------------ ensamblar
def deck(titulo, sistema, slides_file, salida, con_excel=False):
    css = open(S + 'retro.css.html', encoding='utf-8').read()
    js = open(S + 'retro.js.html', encoding='utf-8').read()
    slides = open(S + slides_file, encoding='utf-8').read()
    _f, _T, _ = _d.calcular()
    slides = _tk.render(slides, _tk.construir(_f, _T), slides_file)
    slides = (slides.replace('__ROWS_ALM__', '\n          '.join(rows_alm))
                    .replace('__ROWS_BTN__', '\n          '.join(rows_btn))
                    .replace('__ROWS_AMB__', '\n          '.join(rows_amb))
                    .replace('__ROWS_TRZ__', '\n              '.join(rows_trz)))
    excel_btn = ''
    if con_excel:
        b64 = base64.b64encode(open(XLSX, 'rb').read()).decode()
        kb = round(os.path.getsize(XLSX) / 1024)
        excel_btn = (f'<a class="chip-btn" download="costo-inventario-julio-2026.xlsx" '
                     f'href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{b64}">'
                     f'Excel · {kb} KB</a>')
    html = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo}</title>
{css}
</head>
<body>
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <div class="progress" id="progress" aria-hidden="true"></div>

  <header class="topbar">
    <div class="system-id">
      <span class="pulse" aria-hidden="true"></span>
      <span>Inventario // OS</span>
      <span>{sistema}</span>
    </div>
    <div class="top-actions">
      <button class="chip-btn" type="button" id="prev">↑ anterior</button>
      {excel_btn}
      <button class="chip-btn" type="button" id="print">Imprimir / PDF</button>
    </div>
  </header>

  <nav class="rail" id="rail" aria-label="Navegación de la presentación"></nav>

  <main id="contenido">
{slides}
  </main>

{js}
</body>
</html>'''
    for tok in ['__ROWS_ALM__', '__ROWS_BTN__', '__ROWS_AMB__', '__ROWS_TRZ__']:
        assert tok not in html, f'sin sustituir: {tok}'
    open(salida, 'w', encoding='utf-8').write(html)
    print(f'{os.path.basename(salida):42s} {len(html)/1024:6.0f} KB  ·  {html.count("<section class=")} láminas')

if __name__ == '__main__':
    deck('Costo de inventario · Julio 2026 · Piazza Pasticcio',
         'costo de inventario · julio 2026',
         'costo.slides.html', '/home/lilp/proyectos/presentacion-costo-julio-2026.html', con_excel=True)
    if os.path.exists(S + 'toma.slides.html'):
        deck('Toma digital · 31 de julio de 2026 · Piazza Pasticcio',
             'toma digital · 31.07.2026',
             'toma.slides.html', '/home/lilp/proyectos/presentacion-toma-2026-07-31.html')
