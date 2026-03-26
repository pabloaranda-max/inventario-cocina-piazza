"""
scraper_catalogos.py — Descarga catalogos de inventario y reporte de recetas desde xetux.
Corre los sabados via GitHub Actions.

Descarga:
  - catalogo_{ALMACEN}_{fecha}.xls       — plantilla activa por almacen (articulos + subrecetas)
  - recetas_{fecha}.xls                  — todas las subrecetas con ingredientes (mise en place)
  - inventario_{ALMACEN}_{YYYYMM}.xls   — inventario cerrado del mes anterior por almacen

Uso:
  python3 scraper_catalogos.py
"""

import os
import asyncio
from pathlib import Path
from datetime import date, timedelta
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv(dotenv_path=Path(__file__).parent / '.env')

POS_URL  = os.environ["POS_URL"].rstrip("/")
POS_USER = os.environ["POS_USER"]
POS_PASS = os.environ["POS_PASSWORD"]
DL       = Path(__file__).parent / "downloads"
DL.mkdir(exist_ok=True)

# Almacenes a descargar — el índice de fila se detecta automáticamente por nombre
ALMACENES = ["BARRA", "COCINA", "ALIMENTARI", "CAVA", "GENERAL", "SALUMERIA"]

# ── Login ──────────────────────────────────────────────────────────────────────

async def login(page):
    await page.goto(f"{POS_URL}/login.xhtml", wait_until="networkidle")
    await page.fill("input[id$='username']", POS_USER)
    await page.fill("input[id$='password']", POS_PASS)
    await page.click("button[id$='j_idt20']")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2)
    if "login" in page.url:
        raise RuntimeError(f"Login fallo. URL: {page.url}")
    print("Login OK")

# ── Catalogo por almacen ───────────────────────────────────────────────────────

async def _aplicar_filtros_catalogo(page, almacen: str):
    """Navega a la página, aplica filtros Plantilla+Almacén+Mensual y dispara la búsqueda."""
    await page.goto(f"{POS_URL}/logged/inventory/management/index.xhtml", wait_until="networkidle")
    await asyncio.sleep(2)

    await page.evaluate(f"""() => {{
        // Vista Plantilla
        var date = document.getElementById('dateSearchList_input');
        if (date) {{
            for (var i=0; i<date.options.length; i++) {{
                if (date.options[i].text.toUpperCase().includes('PLANTILLA')) {{
                    date.selectedIndex = i;
                    date.dispatchEvent(new Event('change', {{bubbles:true}}));
                    break;
                }}
            }}
        }}
        // Almacén
        var wh = document.getElementById('warehouseGroupSelect_input');
        if (wh) {{
            for (var i=0; i<wh.options.length; i++) {{
                if (wh.options[i].text.toUpperCase() === '{almacen}') {{
                    wh.selectedIndex = i;
                    wh.dispatchEvent(new Event('change', {{bubbles:true}}));
                    break;
                }}
            }}
        }}
        // Frecuencia Mensual
        var freq = document.getElementById('frecuencyList_input');
        if (freq) {{
            for (var i=0; i<freq.options.length; i++) {{
                if (freq.options[i].text.toUpperCase().includes('MENSUAL')) {{
                    freq.selectedIndex = i;
                    freq.dispatchEvent(new Event('change', {{bubbles:true}}));
                    break;
                }}
            }}
        }}
    }}""")
    await asyncio.sleep(0.5)

    # Disparar búsqueda igual que download_inventario_mensual
    await page.click("#j_idt131")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(3)


async def download_catalogo(page, almacen: str) -> Path | None:
    print(f"\n-> Catalogo {almacen}")

    await _aplicar_filtros_catalogo(page, almacen)

    # Buscar la fila del almacén en la tabla filtrada
    filas = await page.query_selector_all("#tableList tbody tr:not(.ui-datatable-empty-message)")
    row_idx = None
    for i, fila in enumerate(filas):
        texto = (await fila.inner_text()).upper().strip()
        if almacen in texto:
            row_idx = i
            break

    if row_idx is None:
        nombres = [(await f.inner_text()).strip()[:60] for f in filas]
        print(f"  Almacén {almacen} no encontrado ({len(filas)} filas): {nombres[:8]}")
        return None

    # Abrir detalle
    await _aplicar_filtros_catalogo(page, almacen)
    selector = f"[id='tableList:{row_idx}:j_idt226']"
    try:
        await page.wait_for_selector(selector, timeout=8000)
        await page.click(selector)
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(2)
    except Exception as e:
        print(f"  Error abriendo detalle: {e}")
        return None

    out = DL / f"catalogo_{almacen}_{date.today().strftime('%Y%m%d')}.xls"
    excel_btn = "[id='tab:j_idt193:detailTableList:exportToExcel']"

    try:
        async with page.expect_download(timeout=15000) as dl_info:
            await page.wait_for_selector(excel_btn, timeout=8000)
            await page.click(excel_btn)
        dl = await dl_info.value
        await dl.save_as(str(out))
        print(f"  Guardado: {out.name} ({out.stat().st_size // 1024} KB)")
        return out
    except Exception as e:
        print(f"  Error descargando: {e}")
        return None

# ── Inventario mensual cerrado ────────────────────────────────────────────────

async def download_inventario_mensual(page) -> dict:
    """
    Descarga el inventario cerrado del mes anterior para cada almacen.
    Filtra por MENSUAL + APLICADO + rango del mes anterior.
    Retorna dict {almacen: path}.
    """
    # Calcular mes anterior
    today = date.today()
    ultimo_dia = today.replace(day=1) - timedelta(days=1)
    primer_dia = ultimo_dia.replace(day=1)
    mes_slug = primer_dia.strftime("%Y%m")
    fecha_ini = primer_dia.strftime("%d/%m/%Y")
    fecha_fin = ultimo_dia.strftime("%d/%m/%Y")

    print(f"\n-> Inventarios mensuales cerrados ({fecha_ini} - {fecha_fin})")

    await page.goto(f"{POS_URL}/logged/inventory/management/index.xhtml", wait_until="networkidle")
    await asyncio.sleep(2)

    # Filtrar: MENSUAL + APLICADO + rango de fechas
    await page.evaluate("""() => {
        var f = document.getElementById('frecuencyList_input');
        for (var i=0;i<f.options.length;i++) if(f.options[i].text==='MENSUAL'){f.selectedIndex=i;f.dispatchEvent(new Event('change',{bubbles:true}));break;}
        var s = document.getElementById('statusGroupList_input');
        for (var i=0;i<s.options.length;i++) if(s.options[i].text==='APLICADO'){s.selectedIndex=i;s.dispatchEvent(new Event('change',{bubbles:true}));break;}
    }""")
    await asyncio.sleep(0.5)

    # Setear fechas via PrimeFaces calendar (widget names exactos, sin usar find_date_widgets)
    for w, val in [("widget_startDateInput", fecha_ini), ("widget_endDateInput", fecha_fin)]:
        parts = val.split('/')
        iso = f"{parts[2]}-{parts[1]}-{parts[0]}"
        await page.evaluate(f"""(() => {{
            try {{ PF('{w}').setDate(new Date('{iso}')); }} catch(e) {{
                var id = '{w}'.replace('widget_','') + '_input';
                var el = document.getElementById(id);
                if(el){{ el.value='{val}'; el.dispatchEvent(new Event('change',{{bubbles:true}})); }}
            }}
        }})()""")
        await asyncio.sleep(0.2)

    # Buscar
    await page.click("#j_idt131")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(3)

    async def aplicar_filtros():
        await page.goto(f"{POS_URL}/logged/inventory/management/index.xhtml", wait_until="networkidle")
        await asyncio.sleep(2)
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

    almacenes_objetivo = set(ALMACENES)
    mapa = {}  # almacen -> row_idx
    for i, fila in enumerate(filas):
        cell = await fila.query_selector("[id$=':warehouse']")
        if cell:
            almacen = (await cell.inner_text()).strip()
            if almacen in almacenes_objetivo:
                mapa[almacen] = i

    print(f"  Almacenes a descargar: {list(mapa.keys())}")

    # Segunda pasada: descargar cada uno navegando por indice
    resultados = {}
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
            resultados[almacen] = out
        except Exception as e:
            print(f"     Error: {e}")
            resultados[almacen] = None

    return resultados

# ── Reporte de recetas (mise en place) ────────────────────────────────────────

async def download_recetas(page) -> Path | None:
    print(f"\n-> Recetas (mise en place)")
    await page.goto(f"{POS_URL}/logged/reports/recipes/index.xhtml", wait_until="networkidle")
    await asyncio.sleep(2)

    # Buscar todos — sin filtros
    await page.click("#j_idt159")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(4)

    out = DL / f"recetas_{date.today().strftime('%Y%m%d')}.xls"

    # Verificar que hay datos
    btn = page.locator("[id='tableList:exportToExcel']")
    if await btn.count() == 0:
        print("  Sin datos (boton no encontrado)")
        return None
    classes = await btn.get_attribute("class") or ""
    if "ui-state-disabled" in classes:
        print("  Sin datos (tabla vacia)")
        return None

    try:
        async with page.expect_download(timeout=25000) as dl_info:
            await btn.click()
            await asyncio.sleep(1.5)
            si_btn = page.locator("button:visible").filter(has_text="Si")
            if await si_btn.count() > 0:
                await si_btn.first.click()
        dl = await dl_info.value
        await dl.save_as(str(out))
        print(f"  Guardado: {out.name} ({out.stat().st_size // 1024} KB)")
        return out
    except Exception as e:
        print(f"  Error descargando: {e}")
        return None

# ── Main ───────────────────────────────────────────────────────────────────────

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await login(page)

        results = {}

        # Catalogos por almacen
        for almacen in ALMACENES:
            try:
                path = await download_catalogo(page, almacen)
                results[f"catalogo_{almacen}"] = path
            except Exception as e:
                print(f"  Error en {almacen}: {e}")
                results[f"catalogo_{almacen}"] = None

        # Reporte de recetas
        try:
            path = await download_recetas(page)
            results["recetas"] = path
        except Exception as e:
            print(f"  Error en recetas: {e}")
            results["recetas"] = None

        # Inventarios mensuales cerrados (mes anterior)
        try:
            inv_results = await download_inventario_mensual(page)
            for almacen, path in inv_results.items():
                results[f"inventario_{almacen}"] = path
        except Exception as e:
            print(f"  Error en inventarios mensuales: {e}")

        await browser.close()

    print("\n── Resultados ──")
    ok = sum(1 for p in results.values() if p)
    for key, path in results.items():
        status = f"OK  {path.name}" if path else "FALLO"
        print(f"  {key}: {status}")
    print(f"\n{ok}/{len(results)} exitosos")

if __name__ == "__main__":
    asyncio.run(run())
