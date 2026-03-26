"""
scraper_reportes.py — Descarga reportes de xetux y los guarda como XLS en ./downloads/

Reportes diarios (corre cada dia):
  - ventas_consolidado
  - compras_detalle (agrupado por Almacen > Articulo)

Reportes mensuales (corre el dia 1 de cada mes, descarga el mes anterior):
  - mermas       (agrupado por Almacen)
  - produccion   (agrupado por Subreceta > Almacen de Incremento)
  - transferencias (agrupado por Almacen Origen > Almacen Destino)

Uso:
  python3 scraper_reportes.py                    # segun el dia (diario o mensual)
  python3 scraper_reportes.py --force-monthly    # fuerza descarga mensual
  python3 scraper_reportes.py --from 2026-03-01 --to 2026-03-31  # rango manual
"""

import os
import asyncio
import argparse
from pathlib import Path
from datetime import date, datetime, timedelta
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv(dotenv_path=Path(__file__).parent / '.env')

POS_URL  = os.environ["POS_URL"].rstrip("/")
POS_USER = os.environ["POS_USER"]
POS_PASS = os.environ["POS_PASSWORD"]
DL       = Path(__file__).parent / "downloads"
DL.mkdir(exist_ok=True)

def url(path):
    return f"{POS_URL}{path}"

def fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")

def slug(d: date) -> str:
    return d.strftime("%Y%m%d")

# ── Login ──────────────────────────────────────────────────────────────────────

async def login(page):
    await page.goto(url("/login.xhtml"), wait_until="networkidle")
    await page.fill("input[id$='username']", POS_USER)
    await page.fill("input[id$='password']", POS_PASS)
    await page.click("button[id$='j_idt20']")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2)
    if "login" in page.url:
        raise RuntimeError(f"Login fallo. URL: {page.url}")
    print("Login OK")

# ── Utilerias ─────────────────────────────────────────────────────────────────

async def set_pf_date(page, widget_name: str, value: str):
    """Setea un PrimeFaces Calendar. value en formato dd/mm/yyyy."""
    parts = value.split("/")
    iso = f"{parts[2]}-{parts[1]}-{parts[0]}"
    await page.evaluate(f"""(() => {{
        try {{
            PF('{widget_name}').setDate(new Date('{iso}'));
        }} catch(e) {{
            var id = '{widget_name}'.replace('widget_','') + '_input';
            var el = document.getElementById(id);
            if (el) {{
                el.value = '{value}';
                ['input','change','blur'].forEach(ev =>
                    el.dispatchEvent(new Event(ev, {{bubbles:true}})));
            }}
        }}
    }})()""")
    await asyncio.sleep(0.3)

async def set_select(page, select_id: str, value: str):
    """Selecciona una opcion por texto en un <select> de PrimeFaces."""
    await page.evaluate(f"""(() => {{
        var sel = document.getElementById('{select_id}_input');
        if (!sel) sel = document.getElementById('{select_id}');
        if (!sel) return;
        for (var i = 0; i < sel.options.length; i++) {{
            if (sel.options[i].text.trim() === '{value}') {{
                sel.selectedIndex = i;
                sel.dispatchEvent(new Event('change', {{bubbles: true}}));
                // trigger PrimeFaces update si existe
                try {{ PF('{select_id}').selectValue(sel.options[i].value); }} catch(e) {{}}
                break;
            }}
        }}
    }})()""")
    await asyncio.sleep(0.5)

async def goto_fresh(page, path: str):
    """Navega a una URL y maneja loginDialog si aparece (re-login si es necesario)."""
    await page.goto(url(path), wait_until="networkidle")
    await asyncio.sleep(2)
    # Si aparece el loginDialog la sesión expiró — re-login completo
    if "login" in page.url:
        print("  Sesión expirada, re-login...")
        await login(page)
        await page.goto(url(path), wait_until="networkidle")
        await asyncio.sleep(2)
        return
    dialog = page.locator("#loginDialog")
    if await dialog.count() > 0 and await dialog.is_visible():
        print("  loginDialog detectado, re-login...")
        await login(page)
        await page.goto(url(path), wait_until="networkidle")
        await asyncio.sleep(2)

async def set_dates(page, w_ini: str, w_end: str, d0: date, d1: date):
    """Setea los dos datepickers de un reporte usando widget names exactos."""
    await set_pf_date(page, w_ini, fmt(d0))
    await set_pf_date(page, w_end, fmt(d1))

async def download_excel(page, export_btn_id: str, out_path: Path) -> Path | None:
    """Hace clic en exportar, confirma el dialog si aparece y guarda el archivo."""
    btn = page.locator(f"[id='{export_btn_id}']")
    if await btn.count() == 0:
        print(f"  Sin datos (boton no encontrado)")
        return None
    classes = await btn.get_attribute("class") or ""
    if "ui-state-disabled" in classes:
        print(f"  Sin datos para el periodo (tabla vacia)")
        return None

    try:
        async with page.expect_download(timeout=25000) as dl_info:
            await btn.click()
            await asyncio.sleep(1.5)
            # confirmar dialog generico (cada reporte tiene IDs distintos)
            si_btn = page.locator("button:visible").filter(has_text="Si")
            if await si_btn.count() > 0:
                await si_btn.first.click()
        dl = await dl_info.value
        await dl.save_as(str(out_path))
        print(f"  Guardado: {out_path.name} ({out_path.stat().st_size // 1024} KB)")
        return out_path
    except Exception as e:
        print(f"  Error descargando: {e}")
        return None

# ── Reportes ──────────────────────────────────────────────────────────────────

async def scrape_ventas_detalle(page, d0: date, d1: date) -> Path | None:
    print(f"\n-> Ventas detalle ({fmt(d0)} - {fmt(d1)})")
    await goto_fresh(page, "/logged/reports/salesDetail/index.xhtml")

    await set_dates(page, "widget_dateIniInput", "widget_dateEndInput", d0, d1)

    # Activar checkbox "Consolidado" (id=j_idt151 — confirmado 2026-03-25)
    await page.evaluate("""() => {
        try { PF('j_idt151').check(); } catch(e) {
            var cb = document.getElementById('j_idt151_input');
            if (cb && !cb.checked) cb.click();
        }
    }""")
    await asyncio.sleep(0.3)

    # Agrupar por Tipo de Producto > Producto > Ambiente
    await set_select(page, "fistGroupList", "Tipo de Producto")
    await set_select(page, "secondGroupList", "Producto")
    await set_select(page, "thirdGroupList", "Ambiente")

    await page.click("#j_idt206")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(4)

    out = DL / f"ventas_detalle_{slug(d0)}.xls"
    return await download_excel(page, "tableList:exportToExcel", out)

async def scrape_compras_detalle(page, d0: date, d1: date) -> Path | None:
    print(f"\n-> Compras detalle ({fmt(d0)} - {fmt(d1)})")
    await goto_fresh(page, "/logged/reports/purchases/detail.xhtml")

    await set_dates(page, "widget_startDateInput", "widget_endDateInput", d0, d1)

    # Forzar F. Documento (value=2) — el default de la página es F. Recepción
    # pero las compras en Xetux se registran consistentemente por F. Documento
    await page.evaluate("() => { try { PF('widget_fieldDateList').selectValue('2'); } catch(e) {} }")
    await asyncio.sleep(0.3)

    # Agrupar por Almacen > Articulo
    await set_select(page, "groupField1List", "Almacén")
    await set_select(page, "groupField2List", "Artículo")

    await page.click("#j_idt180")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(4)

    out = DL / f"compras_detalle_{slug(d0)}.xls"
    return await download_excel(page, "tableList:exportToExcel", out)

async def scrape_mermas(page, d0: date, d1: date) -> Path | None:
    print(f"\n-> Mermas ({fmt(d0)} - {fmt(d1)})")
    await goto_fresh(page, "/logged/reports/waste/index.xhtml")

    await set_dates(page, "widget_dateIniInput", "widget_dateEndInput", d0, d1)

    # Agrupar por Almacen
    await set_select(page, "groupByList", "Almacén")

    await page.click("#j_idt163")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(4)

    out = DL / f"mermas_{slug(d0)}_{slug(d1)}.xls"
    return await download_excel(page, "tableList:exportToExcel", out)

async def scrape_produccion(page, d0: date, d1: date) -> Path | None:
    print(f"\n-> Produccion ({fmt(d0)} - {fmt(d1)})")
    await goto_fresh(page, "/logged/reports/production/index.xhtml")

    await set_dates(page, "widget_dateIniInput", "widget_dateEndInput", d0, d1)

    # Agrupar por Subreceta > Almacen de Incremento
    await set_select(page, "groupList", "Subreceta")
    await set_select(page, "group2List", "Almacen de Incremento")

    await page.click("#j_idt161")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(4)

    out = DL / f"produccion_{slug(d0)}_{slug(d1)}.xls"
    return await download_excel(page, "tableList:exportToExcel", out)

async def scrape_transferencias(page, d0: date, d1: date) -> Path | None:
    print(f"\n-> Transferencias ({fmt(d0)} - {fmt(d1)})")
    await goto_fresh(page, "/logged/reports/warehouseTransfers/index.xhtml")

    await set_dates(page, "widget_dateIniInput", "widget_dateEndInput", d0, d1)

    # Agrupar por Almacen Origen > Almacen Destino
    await set_select(page, "groupLst", "Almacén Origen")
    await set_select(page, "group2Lst", "Almacén Destino")

    await page.click("#j_idt175")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(4)

    out = DL / f"transferencias_{slug(d0)}_{slug(d1)}.xls"
    return await download_excel(page, "tableList:exportToExcel", out)

ALMACENES = ["BARRA", "COCINA", "ALIMENTARI", "CAVA", "GENERAL", "SALUMERIA"]

async def scrape_inventarios_cerrados(page, d0: date, d1: date) -> None:
    """Descarga el inventario cerrado mensual por almacen desde gestion de inventarios."""
    mes_slug = d0.strftime("%Y%m")
    fecha_ini = fmt(d0)
    fecha_fin = fmt(d1)
    print(f"\n-> Inventarios cerrados ({fecha_ini} - {fecha_fin})")

    async def aplicar_filtros():
        await goto_fresh(page, "/logged/inventory/management/index.xhtml")
        await page.evaluate("""() => {
            var f = document.getElementById('frecuencyList_input');
            for (var i=0;i<f.options.length;i++) if(f.options[i].text==='MENSUAL'){f.selectedIndex=i;f.dispatchEvent(new Event('change',{bubbles:true}));break;}
            var s = document.getElementById('statusGroupList_input');
            for (var i=0;i<s.options.length;i++) if(s.options[i].text==='APLICADO'){s.selectedIndex=i;s.dispatchEvent(new Event('change',{bubbles:true}));break;}
        }""")
        await asyncio.sleep(0.3)
        await page.click("#j_idt131")
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(3)

    # Primera pasada: mapear almacen -> indice de fila
    await aplicar_filtros()
    filas = await page.query_selector_all("#tableList tbody tr:not(.ui-datatable-empty-message)")
    print(f"  Inventarios encontrados: {len(filas)}")

    mapa = {}
    for i, fila in enumerate(filas):
        cell = await fila.query_selector("[id$=':warehouse']")
        if cell:
            almacen = (await cell.inner_text()).strip()
            if almacen in ALMACENES:
                mapa[almacen] = i

    print(f"  Almacenes a descargar: {list(mapa.keys())}")

    for almacen, idx in mapa.items():
        print(f"  -> {almacen} (fila {idx})")
        await aplicar_filtros()
        detail_btn = f"[id='tableList:{idx}:j_idt226']"
        try:
            await page.wait_for_selector(detail_btn, timeout=5000)
            await page.click(detail_btn)
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(2)
            out = DL / f"inventario_{almacen}_{mes_slug}.xls"
            excel_btn = "[id='tab:j_idt193:detailTableList:exportToExcel']"
            async with page.expect_download(timeout=15000) as dl_info:
                await page.wait_for_selector(excel_btn, timeout=8000)
                await page.click(excel_btn)
            dl = await dl_info.value
            await dl.save_as(str(out))
            print(f"     Guardado: {out.name} ({out.stat().st_size // 1024} KB)")
        except Exception as e:
            print(f"     Error en {almacen}: {e}")

async def scrape_consumo(page, d0: date, d1: date) -> Path | None:
    print(f"\n-> Consumo por ventas ({fmt(d0)} - {fmt(d1)})")
    await goto_fresh(page, "/logged/reports/consumption/index.xhtml")

    await set_dates(page, "widget_dateIniInput", "widget_dateEndInput", d0, d1)

    buscar_btn = page.locator("button:visible, input[type='submit']:visible").filter(has_text="Buscar")
    if await buscar_btn.count() > 0:
        await buscar_btn.first.click()
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(4)

    out = DL / f"consumo_{slug(d0)}_{slug(d1)}.xls"
    return await download_excel(page, "tableList:exportToExcel", out)

async def scrape_inventario_actual(page) -> Path | None:
    today = date.today()
    print(f"\n-> Inventario actual ({today})")
    await goto_fresh(page, "/logged/reports/currentInventory/index.xhtml")

    # Intentar buscar si hay botón con texto "Buscar" (algunos reportes auto-cargan)
    buscar_btn = page.locator("button:visible, input[type='submit']:visible").filter(has_text="Buscar")
    if await buscar_btn.count() > 0:
        await buscar_btn.first.click()
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(4)
    else:
        await asyncio.sleep(2)

    out = DL / f"inventario_actual_{slug(today)}.xls"
    return await download_excel(page, "tableList:exportToExcel", out)

# ── Main ───────────────────────────────────────────────────────────────────────

def prev_month_range() -> tuple[date, date]:
    """Retorna (primer dia, ultimo dia) del mes anterior."""
    today = date.today()
    last_day = today.replace(day=1) - timedelta(days=1)
    first_day = last_day.replace(day=1)
    return first_day, last_day

async def run(d0: date, d1: date, monthly: bool,
              monthly_d0: date | None = None, monthly_d1: date | None = None):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await login(page)

        # Reportes diarios — siempre
        await scrape_ventas_detalle(page, d0, d1)
        await scrape_compras_detalle(page, d0, d1)
        await scrape_transferencias(page, d0, d1)
        await scrape_inventario_actual(page)

        # Reportes mensuales — solo el dia 2 o si se fuerza
        if monthly:
            # Si se pasaron --from/--to explícitos, usarlos para el mensual también
            pm0 = monthly_d0 if monthly_d0 else prev_month_range()[0]
            pm1 = monthly_d1 if monthly_d1 else prev_month_range()[1]
            print(f"\nReportes mensuales: {fmt(pm0)} - {fmt(pm1)}")
            await scrape_mermas(page, pm0, pm1)
            await scrape_produccion(page, pm0, pm1)
            await scrape_consumo(page, pm0, pm1)
            await scrape_inventarios_cerrados(page, pm0, pm1)

        await browser.close()
    print("\nScraping completado.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="date_from", help="Fecha inicio YYYY-MM-DD")
    parser.add_argument("--to",   dest="date_to",   help="Fecha fin YYYY-MM-DD")
    parser.add_argument("--force-monthly", action="store_true",
                        help="Fuerza descarga de reportes mensuales")
    args = parser.parse_args()

    today = date.today()

    if args.date_from and args.date_to:
        d0 = datetime.strptime(args.date_from, "%Y-%m-%d").date()
        d1 = datetime.strptime(args.date_to,   "%Y-%m-%d").date()
    else:
        # Hoy como rango por defecto — el scraper corre de noche cuando el restaurante ya cerró
        d0 = d1 = today

    # Mensual si es dia 2 del mes o se fuerza
    monthly = args.force_monthly or (today.day == 2)

    print(f"Rango diario: {d0} -> {d1}")
    print(f"Mensual: {'si' if monthly else 'no'}")
    asyncio.run(run(d0, d1, monthly, monthly_d0=d0 if args.date_from else None, monthly_d1=d1 if args.date_to else None))

if __name__ == "__main__":
    main()
