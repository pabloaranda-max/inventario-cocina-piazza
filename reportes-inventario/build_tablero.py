#!/usr/bin/env python3
"""Tablero de una página: KPIs de costo y rotación de inventario."""
import xlrd, collections, os, sys
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos as _d

S = '/home/lilp/proyectos/reportes-inventario/'
OUT_HTML = '/home/lilp/proyectos/tablero-inventario-julio-2026.html'
OUT_TXT = '/home/lilp/proyectos/tablero-inventario-julio-2026.txt'

def M(s):
    s = str(s).replace('$', '').replace(',', '').strip()
    n = s.startswith('-'); s = s.lstrip('-')
    try: v = float(s)
    except ValueError: v = 0.0
    return -v if n else v

FIN = _d.FIN
A = _d.ALM          # copia única: las cifras viven en datos.py
P = set(A)
sh = xlrd.open_workbook('/mnt/c/Users/P_ara/Downloads/'
                        'Reporte de Transferencia entre Almacenes-Sat Aug 01 05_42_08 CST 2026.xls').sheets()[0]
out = collections.defaultdict(float); intra = collections.defaultdict(float)
for r in range(1, sh.nrows):
    v = [str(c.value) for c in sh.row(r)]
    o, d, c = v[1].strip(), v[2].strip(), M(v[11])
    out[o] += c
    if o in P and d in P: intra[o] += c

rows = []
TR = TV = TT = TF = 0.0
for k in sorted(A, key=lambda x: -(A[x][3] - intra[x] - A[x][4])):
    ini, com, fin, real, teo, vt, d0 = A[k]
    dias = (FIN - d0).total_seconds() / 86400
    rn = real - intra[k]; vn = vt - out[k]; br = rn - teo
    dinv = fin / (real / dias)
    TR += rn; TV += vn; TT += teo; TF += fin
    rows.append(dict(alm=k, dias=dias, venta=vn, real=rn, teo=teo, br=br, fin=fin,
                     dinv=dinv, rot=365 / dinv,
                     # GENERAL no vende: su denominador es residual y el % no significa nada
                     pr=(rn / vn * 100) if (vn > 1000 and k != 'GENERAL') else None,
                     pt=(teo / vn * 100) if (vn > 1000 and k != 'GENERAL') else None))
VENTA_MES = 2344162.90
D = 31.0
DINV = TF / (TR / D)
TOT = dict(venta=TV, real=TR, teo=TT, br=TR - TT, fin=TF, dinv=DINV, rot=365 / DINV,
           pr=TR / TV * 100, pt=TT / TV * 100)

# ------------------------------------------------------------------ HTML
def td(v, cls=''):
    return f'<div class="mono{(" " + cls) if cls else ""}">{v}</div>'

body = []
for r in rows:
    colb = 'style="color:var(--green)"' if r['br'] < 0 else ('style="color:var(--red)"' if r['br'] > 40000 else '')
    cold = 'style="color:var(--red)"' if r['dinv'] > 60 else ''
    body.append(
        f'<div>{r["alm"]}</div>'
        + td(f'{r["venta"]:,.0f}')
        + td(f'{r["real"]:,.0f}')
        + td(f'{r["pr"]:.1f} %' if r['pr'] else '—')
        + td(f'{r["pt"]:.1f} %' if r['pt'] else '—')
        + f'<div class="mono" {colb}>{"−" if r["br"]<0 else ""}{abs(r["br"]):,.0f}</div>'
        + td(f'{r["fin"]:,.0f}')
        + f'<div class="mono" {cold}>{r["dinv"]:.0f}</div>'
        + td(f'{r["rot"]:.1f}'))
body.append(
    '<div><b>TOTAL</b></div>'
    + td(f'<b>{TOT["venta"]:,.0f}</b>') + td(f'<b>{TOT["real"]:,.0f}</b>')
    + td(f'<b>{TOT["pr"]:.1f} %</b>') + td(f'<b>{TOT["pt"]:.1f} %</b>')
    + td(f'<b>{TOT["br"]:,.0f}</b>') + td(f'<b>{TOT["fin"]:,.0f}</b>')
    + td(f'<b>{TOT["dinv"]:.0f}</b>') + td(f'<b>{TOT["rot"]:.1f}</b>'))

COC = [r for r in rows if r['alm'] == 'COCINA'][0]
ALI = [r for r in rows if r['alm'] == 'ALIMENTARI'][0]
TOT['venta'] = TV
css = open(S + 'retro.css.html', encoding='utf-8').read()
html = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tablero de inventario · Julio 2026 · Piazza Pasticcio</title>
{css}
<style>
  .rail, .progress {{ display: none !important; }}
  .slide {{ min-height: 100svh; padding: 96px 48px 48px; }}
  .kpi-row {{ display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-top: 24px; }}
  .kpi {{ padding: 16px 18px; }}
  .kpi .metric-value {{ font-size: clamp(1.7rem, 3.1vw, 2.7rem); margin: 6px 0 4px; }}
  .board {{ grid-template-columns: 1.15fr .95fr .9fr .7fr .7fr .9fr .95fr .6fr .6fr; margin-top: 26px; }}
  .board > div {{ padding: 9px 12px; }}
  .notes {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 22px; }}
  @media print {{
    .slide {{ padding: .3in .45in; }}
    .frame {{ transform: scale(.78); transform-origin: top center; }}
    .kpi .metric-value {{ font-size: 2.1rem; }}
  }}
  @media (max-width: 900px) {{
    .kpi-row {{ grid-template-columns: repeat(2, 1fr); }}
    .notes {{ grid-template-columns: 1fr; }}
    .board {{ min-width: 760px; }}
    .board-scroll {{ overflow-x: auto; }}
  }}
</style>
</head>
<body>
  <div class="progress" id="progress" aria-hidden="true"></div>
  <header class="topbar">
    <div class="system-id">
      <span class="pulse" aria-hidden="true"></span>
      <span>Inventario // OS</span>
      <span>tablero · julio 2026</span>
    </div>
    <div class="top-actions">
      <button class="chip-btn" type="button" id="print">Imprimir / PDF</button>
    </div>
  </header>
  <main id="contenido">
    <section class="slide" data-title="Tablero" data-index="01">
      <div class="frame" style="width:min(1240px,100%)">
        <div class="eyebrow">Piazza Pasticcio · costo de inventario · julio 2026</div>
        <h2 style="margin-bottom:4px">Tablero del mes</h2>
        <p class="small" style="color:var(--muted);margin:0">Seis almacenes aplicados · SALUMERIA
        pendiente de reaplicación · venta 01–31/07/2026</p>

        <div class="kpi-row">
          <article class="card kpi metric green">
            <div class="metric-label">Venta del mes</div>
            <div class="metric-value">{_d.VENTA_POS/1e6:.2f}M</div>
            <div class="metric-note">${_d.VENTA_POS:,.0f} · POS</div>
          </article>
          <article class="card kpi metric red">
            <div class="metric-label">Costo real</div>
            <div class="metric-value">{TOT["pr"]:.1f}%</div>
            <div class="metric-note">consumo medido</div>
          </article>
          <article class="card kpi metric cyan">
            <div class="metric-label">Costo teórico</div>
            <div class="metric-value">{TOT["pt"]:.1f}%</div>
            <div class="metric-note">según recetas</div>
          </article>
          <article class="card kpi metric magenta">
            <div class="metric-label">Brecha</div>
            <div class="metric-value">{TOT["br"]/1000:.0f}k</div>
            <div class="metric-note">{TOT["pr"]-TOT["pt"]:.1f} puntos</div>
          </article>
          <article class="card kpi metric amber">
            <div class="metric-label">Inventario final</div>
            <div class="metric-value">{TOT["fin"]/1000:.0f}k</div>
            <div class="metric-note">capital en piso</div>
          </article>
          <article class="card kpi metric green">
            <div class="metric-label">Días de inventario</div>
            <div class="metric-value">{TOT["dinv"]:.0f}</div>
            <div class="metric-note">{TOT["rot"]:.1f} rotaciones al año</div>
          </article>
        </div>

        <div class="board-scroll">
        <div class="risk-table board">
          <div class="mono micro">Almacén</div>
          <div class="mono micro">Venta atribuida</div>
          <div class="mono micro">Costo real $</div>
          <div class="mono micro">% real</div>
          <div class="mono micro">% teórico</div>
          <div class="mono micro">Brecha $</div>
          <div class="mono micro">Inv. final $</div>
          <div class="mono micro">Días inv.</div>
          <div class="mono micro">Rot./año</div>
          {"".join(body)}
        </div>
        </div>

        <div class="card amber" style="margin-top:16px;padding:14px 18px">
          <p class="small" style="margin:0"><b>«Venta atribuida» no es la venta del mes.</b> El mes
          vendió <b>${_d.VENTA_POS:,.0f}</b>. La columna suma ${TOT["venta"]:,.0f}: es la venta de los productos que sí tienen
          receta, los únicos que consumen de un almacén, y por eso es el denominador correcto de los
          porcentajes de costo. La diferencia de ${_d.VENTA_POS-TOT["venta"]:,.0f} son los ${_d.VENTA_SIN_RECETA:,.0f} de productos sin receta,
          que no descuentan de ningún inventario.</p>
        </div>

        <div class="notes">
          <article class="card red">
            <div class="metric-label">ALIMENTARI · {ALI["dinv"]:.0f} días de inventario</div>
            <p class="small" style="margin-top:8px">${ALI["fin"]:,.0f} parados con {ALI["rot"]:.1f} rotaciones al año. Es el
            capital más inmovilizado del sistema y el único almacén cuyo conteo salió por encima de
            lo esperado.</p>
          </article>
          <article class="card cyan">
            <div class="metric-label">COCINA · {COC["dinv"]:.0f} días, {COC["rot"]:.0f} rotaciones</div>
            <p class="small" style="margin-top:8px">Rotación sana para perecederos. Concentra la mayor brecha del mes
            —${COC["br"]:,.0f}, el {COC["br"]/TOT["br"]*100:.0f} % del total— con la menor cobertura de conteo: 69 códigos de 742.</p>
          </article>
          <article class="card amber">
            <div class="metric-label">Cada día de inventario</div>
            <p class="small" style="margin-top:8px">Equivale a ${TOT["real"]/_d.DIAS_MES:,.0f} de producto en piso. Bajar la
            rotación consolidada de 25 a 22 días liberaría cerca de $73,000 de capital.</p>
          </article>
        </div>

        <p class="footer-note" style="margin-top:18px">
        <b>Costo real</b> = inventario inicial + compras − inventario final contado, neto de $132,563
        de transferencias entre almacenes contados. <b>Costo teórico</b> = lo que las recetas
        descuentan por lo vendido. <b>Días de inventario</b> = inventario final ÷ consumo diario del
        propio almacén. GENERAL no vende: su % de costo no aplica. Los seis almacenes cubren el mes completo del 30/06 al
        31/07; COCINA y ALIMENTARI se reconstruyeron desde saldos porque un inventario semanal quedó
        guardado como mensual y truncó su periodo. La brecha sube a ~$297,900 al reaplicar SALUMERIA.
        </p>
      </div>
    </section>
  </main>
  <script>
    document.getElementById('print').addEventListener('click', () => window.print());
  </script>
</body>
</html>'''
open(OUT_HTML, 'w', encoding='utf-8').write(html)

# ------------------------------------------------------------------ texto
L = []
L.append('*TABLERO DE INVENTARIO — JULIO 2026*')
L.append('Piazza Pasticcio · 6 de 7 almacenes · venta 01–31/07')
L.append('')
L.append(f'Venta del mes (POS)        ${_d.VENTA_POS:,.0f}')
L.append(f'Costo real de consumo          {TOT["pr"]:.1f} %')
L.append(f'Costo teórico por recetas      {TOT["pt"]:.1f} %')
L.append(f'Brecha              {TOT["pr"]-TOT["pt"]:.1f} pts · ${TOT["br"]:,.0f}')
L.append(f'Inventario final           ${TOT["fin"]:,.0f}')
L.append(f'Días de inventario              {TOT["dinv"]:.0f}')
L.append(f'Rotaciones al año             {TOT["rot"]:.1f}')
L.append('')
L.append('```')
L.append(f'{"ALMACEN":<11}{"COSTO $":>10}{"%REAL":>7}{"%TEO":>6}{"BRECHA":>10}{"DIAS":>6}')
for r in rows:
    pr = f'{r["pr"]:.1f}' if r['pr'] else '—'
    pt = f'{r["pt"]:.1f}' if r['pt'] else '—'
    L.append(f'{r["alm"]:<11}{r["real"]:>10,.0f}{pr:>7}{pt:>6}{r["br"]:>10,.0f}{r["dinv"]:>6.0f}')
L.append(f'{"TOTAL":<11}{TOT["real"]:>10,.0f}{TOT["pr"]:>7.1f}{TOT["pt"]:>6.1f}{TOT["br"]:>10,.0f}{TOT["dinv"]:>6.0f}')
L.append('```')
L.append('')
L.append('*Lo que salta*')
L.append(f'• ALIMENTARI: {ALI["dinv"]:.0f} días de inventario, {ALI["rot"]:.1f} rotaciones al año.')
L.append('  $59,658 parados. El capital más inmovilizado del sistema.')
L.append(f'• COCINA: {COC["dinv"]:.0f} días y {COC["rot"]:.0f} rotaciones —sano—, pero la mayor')
L.append(f'  brecha del mes (${COC["br"]:,.0f}) y la menor cobertura (69 de 742).')
L.append(f'• Cada día de inventario son ${TOT["real"]/_d.DIAS_MES:,.0f} de producto en piso.')
L.append('')
L.append('*La venta atribuida no es la venta del mes.* El mes vendió')
L.append(f'${_d.VENTA_POS:,.0f}. La columna suma ${TV:,.0f}: es la venta de los')
L.append('productos que sí tienen receta, los únicos que consumen de')
L.append('un almacén. La diferencia de $324,172 son los $312,945 de')
L.append('productos sin receta, que no descuentan de ningún inventario.')


L.append('')
L.append('Costo real = inicial + compras − final contado, neto de')
L.append('$132,563 de transferencias entre almacenes. GENERAL no vende:')
L.append('su % no aplica. Los seis cubren el mes completo; COCINA y')
L.append('ALIMENTARI se reconstruyeron desde saldos. Con SALUMERIA')
L.append('reaplicada la brecha va a ~$297,900.')
open(OUT_TXT, 'w', encoding='utf-8').write('\n'.join(L) + '\n')

print(f'{os.path.basename(OUT_HTML):44s} {os.path.getsize(OUT_HTML)/1024:5.0f} KB')
print(f'{os.path.basename(OUT_TXT):44s} {os.path.getsize(OUT_TXT)/1024:5.1f} KB')
print('\n'.join(L[:20]))
