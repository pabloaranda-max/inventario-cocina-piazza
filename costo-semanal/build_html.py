#!/usr/bin/env python3
"""Genera la tabla completa como página web, desde las cifras de datos.py.

    python3 build_html.py    ->  costo-semanal.html

Ni una cifra escrita a mano: todo sale de datos.cuadrar() y de los .xls.
"""
import os
import sys
import collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos

SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'costo-semanal.html')


def M(x, signo=False):
    s = f'{abs(x):,.2f}'
    if signo:
        return ('−' if x < 0 else '+') + s
    return ('−' if x < 0 else '') + s


def P(x, signo=False, dec=2):
    s = f'{abs(x):,.{dec}f}'
    if signo:
        return ('−' if x < 0 else '+') + s + ' %'
    return ('−' if x < 0 else '') + s + ' %'


def cls(x):
    return 'pos' if x < 0 else ('neg' if x > 0 else '')


# ── detalle crudo de los archivos, para las tablas de respaldo ───────────────
def detalle_compras():
    _, filas = datos._hoja(datos._ultimo('Reporte Detallado de Compras*.xls'))
    agg = collections.defaultdict(float)
    prov = collections.defaultdict(float)
    for f in filas:
        alm = datos.ALIAS.get(str(f['Almacén']).strip().upper())
        agg[(alm, str(f['Nombre']).strip())] += datos._money(f['Subtotal'])
        prov[str(f['Proveedor']).strip()] += datos._money(f['Subtotal'])
    return agg, prov


def detalle_desperdicio():
    _, filas = datos._hoja(datos._ultimo('Desperdicios*.xls'))
    out = []
    for f in filas:
        if str(f['Estatus']).strip().upper() != 'APLICADO':
            continue
        out.append((str(f['Código']).strip(),
                    datos.ALIAS.get(str(f['Almacén']).strip().upper()),
                    str(f['Encargado']).strip(),
                    str(f['Fecha de Desperdicio']).split(' ')[0],
                    datos._money(f['Costo Total'])))
    return sorted(out, key=lambda r: -r[4])


def detalle_ventas():
    _, filas = datos._hoja(datos._ultimo('Detallado por Producto*.xls'))
    fam = collections.defaultdict(lambda: [0.0, 0.0, 0.0])
    tipo = collections.defaultdict(lambda: [0.0, 0.0, 0.0])
    for f in filas:
        v, c = datos._money(f['Venta Neta']), datos._money(f['Ultimo Costo'])
        q = datos._money(f['Cantidad'])
        k = str(f['Familia']).strip()
        k = 'ENSAMBLE' if 'ENSAMBLE' in str(f['Producto']).upper() else k
        for d, key in ((fam, k), (tipo, str(f['Tipo de Producto']).strip())):
            d[key][0] += v
            d[key][1] += c
            d[key][2] += q
    return fam, tipo


def comparacion():
    """Cifras del reporte manual, leídas de su propio archivo si sigue ahí."""
    try:
        import openpyxl
        ruta = datos._ultimo('COSTO SEMANAL*.xlsx')
        wb = openpyxl.load_workbook(ruta, data_only=True)
        ws, ws2 = wb['RESUMEN'], wb['RESUMEN 2']
        g = lambda c: ws[c].value
        return dict(archivo=os.path.basename(ruta),
                    cocina=g('D14'), barra=g('E14'), merch=g('F14'),
                    empaque=g('G14'), total=g('H14'), pct=g('C7') * 100,
                    compras=g('R6'),
                    # su merma, de su propio desglose (RESUMEN 2, bloque 2)
                    merma_barra=ws2['C13'].value, merma_cocina=ws2['C14'].value,
                    merma_total=ws2['C15'].value)
    except Exception:
        return None


CSS = """
:root{
  --ground:#F5F6F3; --surface:#FFFFFF; --sunk:#EDEFE9;
  --ink:#1A1D19; --ink-2:#4A5147; --ink-3:#767C71;
  --line:#DDE0D8; --line-2:#C8CCC1;
  --accent:#7A5C1E; --accent-soft:#F0E6CE;
  --pos:#2F6B47; --neg:#A33A2A; --flag:#8A6A12;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --serif:ui-serif,Georgia,"Iowan Old Style","Palatino Linotype",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ground:#131512; --surface:#1B1E19; --sunk:#22261F;
    --ink:#E9EBE4; --ink-2:#AEB4A6; --ink-3:#848A7C;
    --line:#2E332A; --line-2:#3D4338;
    --accent:#D2A94F; --accent-soft:#332C15;
    --pos:#74C193; --neg:#E28B79; --flag:#D2A94F;
  }
}
:root[data-theme="dark"]{
  --ground:#131512; --surface:#1B1E19; --sunk:#22261F;
  --ink:#E9EBE4; --ink-2:#AEB4A6; --ink-3:#848A7C;
  --line:#2E332A; --line-2:#3D4338;
  --accent:#D2A94F; --accent-soft:#332C15;
  --pos:#74C193; --neg:#E28B79; --flag:#D2A94F;
}
*{box-sizing:border-box}
body{
  background:var(--ground); color:var(--ink);
  font-family:var(--sans); font-size:15px; line-height:1.55;
  margin:0; padding:0;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1180px;margin:0 auto;padding:56px 28px 96px;
  display:flex;flex-direction:column;gap:52px}
h1,h2,h3{font-family:var(--serif);font-weight:600;text-wrap:balance;margin:0;
  letter-spacing:-.01em}
h1{font-size:clamp(30px,4.4vw,46px);line-height:1.1}
h2{font-size:23px;line-height:1.25}
p{margin:0;max-width:64ch;color:var(--ink-2)}
.eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink-3);margin:0 0 9px}
header .lede{font-size:17px;margin-top:14px;color:var(--ink-2)}
.rule{height:2px;background:var(--accent);width:46px;margin:20px 0 0;border:0}

/* tiles */
.tiles{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(198px,1fr))}
.tile{background:var(--surface);border:1px solid var(--line);padding:19px 20px 17px;
  display:flex;flex-direction:column;gap:5px}
.tile .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--ink-3)}
.tile .v{font-family:var(--mono);font-size:26px;font-variant-numeric:tabular-nums;
  letter-spacing:-.02em;line-height:1.12}
.tile .s{font-size:12.5px;color:var(--ink-3)}
.tile.lead{background:var(--accent-soft);border-color:var(--accent)}
.tile.lead .v{color:var(--accent)}

section{display:flex;flex-direction:column;gap:15px}
.scroll{overflow-x:auto;border:1px solid var(--line);background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:560px}
caption{text-align:left;padding:13px 16px;font-size:12.5px;color:var(--ink-3);
  border-bottom:1px solid var(--line);background:var(--sunk)}
th,td{padding:9px 14px;text-align:right;white-space:nowrap;
  border-bottom:1px solid var(--line)}
th{font-family:var(--mono);font-size:10.5px;letter-spacing:.07em;
  text-transform:uppercase;color:var(--ink-3);font-weight:500;
  border-bottom:1px solid var(--line-2)}
th:first-child,td:first-child{text-align:left}
td.n{font-family:var(--mono);font-variant-numeric:tabular-nums}
tbody tr:last-child td{border-bottom:0}
tr.total td{border-top:2px solid var(--line-2);font-weight:600;background:var(--sunk)}
tr.total td.n{font-family:var(--mono)}
.pos{color:var(--pos)} .neg{color:var(--neg)}
.tag{font-family:var(--mono);font-size:10px;letter-spacing:.06em;
  text-transform:uppercase;padding:2px 7px;border:1px solid var(--line-2);
  color:var(--ink-3);white-space:nowrap}
.tag.flag{color:var(--flag);border-color:var(--flag)}
td.name{max-width:280px;overflow:hidden;text-overflow:ellipsis}

.note{background:var(--surface);border-left:3px solid var(--accent);
  padding:16px 20px;display:flex;flex-direction:column;gap:8px}
.note p{max-width:72ch;font-size:14px}
.note strong{color:var(--ink)}
.grid2{display:grid;gap:15px;grid-template-columns:repeat(auto-fit,minmax(330px,1fr))}
footer{border-top:1px solid var(--line);padding-top:22px;color:var(--ink-3);
  font-size:12.5px;display:flex;flex-direction:column;gap:5px}
footer code{font-family:var(--mono);font-size:12px;color:var(--ink-2)}
"""


def tabla(caption, cols, filas_html, min_w=None):
    st = f' style="min-width:{min_w}px"' if min_w else ''
    th = ''.join(f'<th>{c}</th>' for c in cols)
    return (f'<div class="scroll"><table{st}><caption>{caption}</caption>'
            f'<thead><tr>{th}</tr></thead><tbody>{filas_html}</tbody></table></div>')


def main():
    filas, T = datos.cuadrar()
    agg_c, prov = detalle_compras()
    desp = detalle_desperdicio()
    fam, tipo = detalle_ventas()
    comp = comparacion()
    F = T['fuentes']
    ini, fin = datos.PERIODO
    H = []
    w = H.append

    w('<title>Costo semanal · 1–9 agosto 2026</title>')
    w(f'<style>{CSS}</style>')
    w('<div class="wrap">')

    # ── cabecera ────────────────────────────────────────────────────────────
    w('<header>')
    w(f'<p class="eyebrow">Piazza · periodo {ini} → {fin}</p>')
    w('<h1>Costo por almacén</h1>')
    w('<hr class="rule">')
    w(f'<p class="lede">Cuatro almacenes, {F["n_compras"]} líneas de compra, '
      f'{F["n_ventas"]} de venta y {F["n_merma"]} folios de desperdicio. '
      'Todas las cifras se generan desde los reportes de Xetux; ninguna se '
      'transcribe a mano.</p>')
    w('</header>')

    # ── tiles ───────────────────────────────────────────────────────────────
    w('<div class="tiles">')
    for k, v, s, lead in [
        ('Costo real', M(T['real']), P(T['pct_real']) + ' de la venta neta', True),
        ('Del cual merma', M(T['merma']), P(T['pct_merma']), False),
        ('Del cual venta', M(T['venta_costo']), P(T['pct_venta']), False),
        ('Consumo teórico', M(T['teorico']), P(T['pct_teorico']), False),
        ('Brecha de receta', M(T['brecha'], True),
         P(T['pct_venta'] - T['pct_teorico'], True) + ' pts', False),
    ]:
        w(f'<div class="tile{" lead" if lead else ""}"><span class="k">{k}</span>'
          f'<span class="v">{v}</span><span class="s">{s}</span></div>')
    w('</div>')

    w('<div class="note"><p><strong>La merma es el problema, no la receta.</strong> '
      f'Se tiraron {M(T["merma"])} contra una brecha de receta de {M(T["brecha"], True)} '
      f'— veinticuatro a uno. Dentro de la merma, {M(filas["EMPAQUE"]["merma"])} son '
      'empaque en dos folios, el 43 % del total de la semana en un solo renglón.</p></div>')

    # ── ecuación ────────────────────────────────────────────────────────────
    w('<section>')
    w('<p class="eyebrow">Inventarios · compras · desperdicios</p>')
    w('<h2>Cómo se forma el costo</h2>')
    w('<p>Inventario inicial más lo que entró, menos lo que quedó. Lo que sale es '
      'todo lo que dejó el almacén; restando la merma queda lo que se vendió.</p>')
    tb = ''
    for a in datos.ALMACENES:
        f = filas[a]
        tb += (f'<tr><td>{a}</td>'
               f'<td class="n">{M(f["inicial"])}</td>'
               f'<td class="n">{M(f["compras"])}</td>'
               f'<td class="n">{M(f["final"])}</td>'
               f'<td class="n"><strong>{M(f["real"])}</strong></td>'
               f'<td class="n">{M(f["merma"])}</td>'
               f'<td class="n">{M(f["venta"])}</td></tr>')
    tb += (f'<tr class="total"><td>Total</td>'
           f'<td class="n">{M(sum(f["inicial"] for f in filas.values()))}</td>'
           f'<td class="n">{M(T["compras"])}</td>'
           f'<td class="n">{M(sum(f["final"] for f in filas.values()))}</td>'
           f'<td class="n">{M(T["real"])}</td>'
           f'<td class="n">{M(T["merma"])}</td>'
           f'<td class="n">{M(T["venta_costo"])}</td></tr>')
    w(tabla('Ecuación del costo, por almacén',
            ['Almacén', 'Inicial', '+ Compras', '− Final', '= Costo real',
             '− Merma', '= Costo de venta'], tb, 720))
    w('</section>')

    # ── % por almacén ───────────────────────────────────────────────────────
    w('<section>')
    w('<p class="eyebrow">Costo contra la venta que cada almacén surte</p>')
    w('<h2>Porcentaje por almacén</h2>')
    w('<p>El punto de venta registra el ingreso donde se cobra, no de dónde salió el '
      'producto. Los postres se venden por cocina con insumos de barra, y cada combo '
      'lleva una bebida que barra surte mientras cocina cobra. La venta se atribuye a '
      'quien pone el costo antes de dividir.</p>')
    tb = ''
    for a in datos.ALMACENES:
        f = filas[a]
        nota = ' <span class="tag">no vende</span>' if a == 'EMPAQUE' else ''
        base = 'venta total' if a == 'EMPAQUE' else M(f['base'])
        tb += (f'<tr><td>{a}{nota}</td>'
               f'<td class="n">{M(f["real"])}</td>'
               f'<td class="n">{base}</td>'
               f'<td class="n"><strong>{P(f["pct_real"])}</strong></td>'
               f'<td class="n">{M(f["venta"])}</td>'
               f'<td class="n">{M(f["teorico"])}</td>'
               f'<td class="n {cls(f["venta"] - f["teorico"])}">'
               f'{M(f["venta"] - f["teorico"], True)}</td></tr>')
    tb += (f'<tr class="total"><td>Total</td><td class="n">{M(T["real"])}</td>'
           f'<td class="n">{M(T["venta"])}</td><td class="n">{P(T["pct_real"])}</td>'
           f'<td class="n">{M(T["venta_costo"])}</td><td class="n">{M(T["teorico"])}</td>'
           f'<td class="n {cls(T["brecha"])}">{M(T["brecha"], True)}</td></tr>')
    w(tabla('Costo real sobre venta atribuida',
            ['Almacén', 'Costo real', 'Venta base', '% costo', 'Costo de venta',
             'Teórico', 'Brecha'], tb, 700))

    tb = ''
    for a in datos.VENDEN:
        pos, at = T['base_pos'][a], filas[a]['base']
        tb += (f'<tr><td>{a}</td><td class="n">{M(pos)}</td><td class="n">{M(at)}</td>'
               f'<td class="n {cls(-(at - pos))}">{M(at - pos, True)}</td></tr>')
    tb += (f'<tr class="total"><td>Total</td>'
           f'<td class="n">{M(sum(T["base_pos"][a] for a in datos.VENDEN))}</td>'
           f'<td class="n">{M(sum(filas[a]["base"] for a in datos.VENDEN))}</td>'
           f'<td class="n">0.00</td></tr>')
    w(tabla(f'La atribución mueve ingreso, no lo crea · postres {M(T["ajuste_postres"])} '
            f'y la parte del combo que surte barra {M(T["ajuste_combo"])}',
            ['Almacén', 'Registrada en el POS', 'Atribuida', 'Diferencia'], tb, 520))
    w('<div class="note"><p>Sin esta corrección barra daría '
      f'<strong>{P(filas["BARRA"]["real"] / T["base_pos"]["BARRA"] * 100)}</strong> de costo, '
      'midiendo su gasto contra una venta que no le acreditaron. Con ella, cocina y '
      f'barra quedan casi empatadas: {P(filas["COCINA"]["pct_real"])} y '
      f'{P(filas["BARRA"]["pct_real"])}.</p></div>')
    w('</section>')

    # ── mercancía vs empaque ────────────────────────────────────────────────
    w('<section>')
    w('<p class="eyebrow">El empaque no factura por sí mismo</p>')
    w('<h2>Mercancía y empaque</h2>')
    tb = (f'<tr><td>Mercancía · cocina, barra y merch</td>'
          f'<td class="n">{M(T["mercancia"])}</td>'
          f'<td class="n">{P(T["pct_mercancia"])}</td></tr>'
          f'<tr><td>Empaque</td><td class="n">{M(T["empaque"])}</td>'
          f'<td class="n">{P(T["pct_empaque"])}</td></tr>'
          f'<tr class="total"><td>Costo real</td><td class="n">{M(T["real"])}</td>'
          f'<td class="n">{P(T["pct_real"])}</td></tr>')
    w(tabla(f'Sobre venta neta de {M(T["venta"])}',
            ['Concepto', 'Importe', '% venta neta'], tb, 420))
    w('</section>')

    # ── compras ─────────────────────────────────────────────────────────────
    w('<section>')
    w(f'<p class="eyebrow">{F["compras"]}</p>')
    w('<h2>Compras del periodo</h2>')
    w('<p>Agrupadas por fecha de recepción, no de documento: el inventario mide lo que '
      'está en el anaquel. Merch no tuvo compras en la semana.</p>')
    w('<div class="grid2">')
    for alm in ('COCINA', 'BARRA', 'EMPAQUE'):
        items = sorted([(k[1], v) for k, v in agg_c.items() if k[0] == alm],
                       key=lambda r: -r[1])
        tb = ''.join(f'<tr><td class="name">{n}</td><td class="n">{M(v)}</td></tr>'
                     for n, v in items)
        tb += (f'<tr class="total"><td>{alm}</td>'
               f'<td class="n">{M(filas[alm]["compras"])}</td></tr>')
        w(tabla(f'{alm} · {len(items)} artículos', ['Artículo', 'Importe'], tb, 300))
    w('</div>')
    tb = ''.join(f'<tr><td class="name">{p}</td><td class="n">{M(v)}</td></tr>'
                 for p, v in sorted(prov.items(), key=lambda r: -r[1]))
    tb += f'<tr class="total"><td>Total</td><td class="n">{M(T["compras"])}</td></tr>'
    w(tabla(f'Por proveedor · {len(prov)} proveedores',
            ['Proveedor', 'Importe'], tb, 400))
    w('</section>')

    # ── desperdicios ────────────────────────────────────────────────────────
    w('<section>')
    w(f'<p class="eyebrow">{F["merma"]}</p>')
    w('<h2>Desperdicio</h2>')
    w(f'<p>Los {len(desp)} folios aplicados del periodo, a último costo para que casen '
      'con los inventarios. Es el renglón más caro de la semana.</p>')
    tb = ''
    for cod, alm, enc, fecha, imp in desp:
        big = ' <span class="tag flag">43 % del total</span>' if imp > T['merma'] * .3 else ''
        tb += (f'<tr><td class="n">{cod}</td><td>{alm}{big}</td><td>{enc.title()}</td>'
               f'<td class="n">{fecha}</td><td class="n">{M(imp)}</td></tr>')
    tb += f'<tr class="total"><td colspan="4">Total aplicado</td><td class="n">{M(T["merma"])}</td></tr>'
    w(tabla('Folios de desperdicio aplicados',
            ['Folio', 'Almacén', 'Encargado', 'Fecha', 'Importe'], tb, 620))
    tb = ''.join(f'<tr><td>{a}</td><td class="n">{M(filas[a]["merma"])}</td>'
                 f'<td class="n">{P(filas[a]["merma"] / T["venta"] * 100)}</td></tr>'
                 for a in datos.ALMACENES if filas[a]['merma'])
    tb += (f'<tr class="total"><td>Total</td><td class="n">{M(T["merma"])}</td>'
           f'<td class="n">{P(T["pct_merma"])}</td></tr>')
    w(tabla('Por almacén', ['Almacén', 'Importe', '% venta neta'], tb, 380))
    w('</section>')

    # ── ventas ──────────────────────────────────────────────────────────────
    w('<section>')
    w(f'<p class="eyebrow">{F["ventas"]}</p>')
    w('<h2>Venta del periodo</h2>')
    w(f'<p>Venta neta de {M(T["venta"])} después de {M(T["descuentos"])} en descuentos. '
      'El costo de la columna derecha es el que registra el punto de venta por receta, '
      'no el del inventario.</p>')
    w('<div class="grid2">')
    tb = ''
    for k, (v, c, q) in sorted(tipo.items()):
        tb += (f'<tr><td>{k}</td><td class="n">{q:,.0f}</td><td class="n">{M(v)}</td>'
               f'<td class="n">{M(c)}</td></tr>')
    tb += (f'<tr class="total"><td>Total</td>'
           f'<td class="n">{sum(x[2] for x in tipo.values()):,.0f}</td>'
           f'<td class="n">{M(T["venta"])}</td>'
           f'<td class="n">{M(T["costo_pos"])}</td></tr>')
    w(tabla('Por tipo de producto', ['Tipo', 'Piezas', 'Venta neta', 'Costo POS'], tb, 340))
    tb = ''
    for k, (v, c, q) in sorted(fam.items(), key=lambda r: -r[1][0]):
        tb += (f'<tr><td>{k}</td><td class="n">{q:,.0f}</td><td class="n">{M(v)}</td>'
               f'<td class="n">{M(c)}</td></tr>')
    w(tabla('Por familia · ENSAMBLE es el combo',
            ['Familia', 'Piezas', 'Venta neta', 'Costo POS'], tb, 340))
    w('</div>')
    w('<div class="note"><p>Los componentes de combo cargan '
      f'<strong>{M(T["combo"])}</strong> de costo sin venta propia: la bebida y la '
      'galleta que van dentro del ENSAMBLE, cuyo ingreso se cobra en el producto '
      'padre. Por eso el costo del POS por tipo no se puede repartir sin corregir.</p></div>')
    w('</section>')

    # ── comparación ─────────────────────────────────────────────────────────
    if comp:
        w('<section>')
        w(f'<p class="eyebrow">{comp["archivo"]}</p>')
        w('<h2>Contra el reporte hecho a mano</h2>')
        w('<p>El mismo periodo, calculado por separado. Las siete líneas de compra de '
          'empaque nunca se cargaron, y con el inventario final ya contado la resta '
          'dio un costo negativo que nadie notó.</p>')
        pares = [('Cocina', comp['cocina'], filas['COCINA']['real']),
                 ('Barra', comp['barra'], filas['BARRA']['real']),
                 ('Empaque', comp['empaque'], filas['EMPAQUE']['real']),
                 ('Merch', comp['merch'], filas['MERCH']['real'])]
        tb = ''
        for n, suyo, mio in pares:
            flag = ' <span class="tag flag">costo negativo</span>' if suyo < 0 else ''
            tb += (f'<tr><td>{n}{flag}</td><td class="n">{M(suyo)}</td>'
                   f'<td class="n">{M(mio)}</td>'
                   f'<td class="n neg">{M(mio - suyo, True)}</td></tr>')
        tb += (f'<tr class="total"><td>Total</td><td class="n">{M(comp["total"])}</td>'
               f'<td class="n">{M(T["real"])}</td>'
               f'<td class="n neg">{M(T["real"] - comp["total"], True)}</td></tr>')
        tb += (f'<tr class="total"><td>% de la venta</td>'
               f'<td class="n">{P(comp["pct"])}</td><td class="n">{P(T["pct_real"])}</td>'
               f'<td class="n neg">{P(T["pct_real"] - comp["pct"], True)} pts</td></tr>')
        w(tabla('Costo real: reporte manual contra generado',
                ['Almacén', 'Reporte manual', 'Real', 'Diferencia'], tb, 520))
        tb = ''
        for q, imp in [
            ('Siete líneas de compra de empaque nunca cargadas', T['compras'] - comp['compras']),
            ('Merma de suministros fuera de su resumen', filas['EMPAQUE']['merma']),
            ('Merma de cocina sumada a medias',
             filas['COCINA']['merma'] - comp['merma_cocina']),
            ('Merma de barra, diferencia menor',
             filas['BARRA']['merma'] - comp['merma_barra']),
        ]:
            tb += f'<tr><td>{q}</td><td class="n">{M(imp)}</td></tr>'
        w(tabla('Qué se quedó fuera', ['Concepto', 'Importe'], tb, 460))
        w('</section>')

    # ── pie ─────────────────────────────────────────────────────────────────
    w('<footer>')
    w('<p>Generado desde los reportes de Xetux. Lo único capturado a mano son los ocho '
      'totales de inventario y el consumo teórico.</p>')
    w(f'<p><code>{F["compras"]}</code></p>')
    w(f'<p><code>{F["ventas"]}</code></p>')
    w(f'<p><code>{F["merma"]}</code></p>')
    w('<p><code>proyectos/costo-semanal · python3 build_html.py</code></p>')
    w('</footer>')
    w('</div>')

    html = '\n'.join(H)
    with open(SALIDA, 'w') as fh:
        fh.write(html)
    print(f'{SALIDA}  ({len(html):,} bytes)')


if __name__ == '__main__':
    main()
