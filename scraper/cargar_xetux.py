"""
cargar_xetux.py — Carga producciones autorizadas y mermas a xetux vía Playwright.

Se llama desde GitHub Actions cuando:
  - Una producción llega a 2 votos de autorización
  - Una merma se registra (carga inmediata)

Uso:
  python3 cargar_xetux.py --producciones     # carga todas las autorizadas pendientes
  python3 cargar_xetux.py --mermas           # carga todas las mermas pendientes
  python3 cargar_xetux.py --todo             # ambas
  python3 cargar_xetux.py --produccion-id ID # carga una producción específica
  python3 cargar_xetux.py --merma-id ID      # carga una merma específica
"""

import os
import asyncio
import argparse
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from playwright.async_api import async_playwright
import requests

load_dotenv(dotenv_path=Path(__file__).parent / '.env')

POS_URL    = os.environ["POS_URL"].rstrip("/")
POS_USER   = os.environ["POS_USER"]
POS_PASS   = os.environ["POS_PASSWORD"]
WORKER_URL = os.environ["WORKER_URL"].rstrip("/")
SYNC_TOKEN = os.environ["SYNC_TOKEN"]

HEADERS_SYNC = {
    'X-Sync-Token': SYNC_TOKEN,
    'Content-Type': 'application/json',
}

# ── Utilidades ────────────────────────────────────────────────────────────────

def url(path: str) -> str:
    return f"{POS_URL}{path}"

def worker_get(endpoint: str) -> dict:
    r = requests.get(f"{WORKER_URL}{endpoint}", headers=HEADERS_SYNC, timeout=15)
    return r.json()

def worker_post(endpoint: str, payload: dict) -> dict:
    r = requests.post(f"{WORKER_URL}{endpoint}", headers=HEADERS_SYNC, json=payload, timeout=15)
    return r.json()

def fmt_fecha(iso_date: str) -> str:
    """'2026-03-24' → '24/03/2026'"""
    d = datetime.strptime(iso_date[:10], '%Y-%m-%d')
    return d.strftime('%d/%m/%Y')

# ── Login ─────────────────────────────────────────────────────────────────────

async def login(page) -> None:
    await page.goto(url("/login.xhtml"), wait_until="networkidle")
    await page.fill("input[id$='username']", POS_USER)
    await page.fill("input[id$='password']", POS_PASS)
    await page.click("button[id$='j_idt20']")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2)
    if "login" in page.url:
        raise RuntimeError(f"Login falló. URL: {page.url}")
    print("Login OK")

# ── Carga de producción ───────────────────────────────────────────────────────

async def cargar_produccion(page, prod: dict) -> tuple[bool, str]:
    """
    Carga una producción autorizada en xetux.
    Retorna (exito, mensaje)
    """
    print(f"\n  → Producción {prod['id']}: {prod['subreceta_nombre']} × {prod['cantidad']}")

    try:
        await page.goto(url("/logged/inventory/production/crud.xhtml"), wait_until="networkidle")
        await asyncio.sleep(2)

        # Verificar sesión activa
        dialog = page.locator("#loginDialog")
        if await dialog.count() > 0 and await dialog.is_visible():
            await page.goto(url("/logged/inventory/production/crud.xhtml"), wait_until="networkidle")
            await asyncio.sleep(2)

        # 1. Seleccionar subreceta en el autocomplete
        sub_input = page.locator("#subrecipeList_input")
        await sub_input.wait_for(timeout=8000)
        await sub_input.fill(prod['subreceta_nombre'][:20])  # primeras letras para filtrar
        await asyncio.sleep(1.5)
        # Seleccionar el primer resultado del dropdown
        panel = page.locator(".ui-autocomplete-panel .ui-autocomplete-item")
        if await panel.count() > 0:
            await panel.first.click()
        else:
            # Intentar con el nombre completo
            await sub_input.fill(prod['subreceta_nombre'])
            await asyncio.sleep(1.5)
            panel = page.locator(".ui-autocomplete-panel .ui-autocomplete-item")
            if await panel.count() > 0:
                await panel.first.click()
            else:
                return False, f"Subreceta '{prod['subreceta_nombre']}' no encontrada en xetux"
        await asyncio.sleep(1)

        # 2. Capturar cantidad
        qty_input = page.locator("#quantityInput")
        await qty_input.wait_for(timeout=5000)
        await qty_input.fill('')
        await qty_input.type(str(prod['cantidad']))
        await asyncio.sleep(0.5)
        # Trigger keyup para actualizar almacenes disponibles
        await qty_input.dispatch_event('keyup')
        await asyncio.sleep(1)

        # 3. Fecha (el sistema usa la fecha actual por defecto;
        #    si la producción es de una fecha distinta, intentar actualizar)
        fecha_prod = prod.get('fecha', '')
        if fecha_prod:
            fecha_hoy = datetime.now().strftime('%Y-%m-%d')
            if fecha_prod != fecha_hoy:
                # Intentar setear fecha via PrimeFaces calendar si existe
                fecha_fmt = fmt_fecha(fecha_prod)
                await page.evaluate(f"""(() => {{
                    var widgets = Object.keys(window.PrimeFaces?.widgets || {{}});
                    var cal = widgets.find(w => w.toLowerCase().includes('date'));
                    if (cal) {{
                        try {{
                            var parts = '{fecha_fmt}'.split('/');
                            PF(cal).setDate(new Date(parts[2]+'-'+parts[1]+'-'+parts[0]));
                        }} catch(e) {{}}
                    }}
                }})()""")
                await asyncio.sleep(0.5)

        # 4. Encargado: el usuario es CLAUDE (ya configurado en el POS)
        #    Si hay un campo de encargado, llenarlo
        encargado_input = page.locator("#taskedEmployeeSelected_input")
        if await encargado_input.count() > 0:
            await encargado_input.fill(POS_USER)
            await asyncio.sleep(0.5)
            panel_enc = page.locator(".ui-autocomplete-panel .ui-autocomplete-item")
            if await panel_enc.count() > 0:
                await panel_enc.first.click()
            await asyncio.sleep(0.5)

        # 5. Guardar — buscar botón de guardado (j_idt205 según HTML explorado)
        save_btn = page.locator("#j_idt205")
        if await save_btn.count() == 0:
            # Fallback: buscar botón con texto Guardar
            save_btn = page.locator("button:visible").filter(has_text="Guardar")
        if await save_btn.count() == 0:
            return False, "Botón Guardar no encontrado"

        await save_btn.click()
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(3)

        # Verificar que se guardó (buscar mensaje de éxito o que la tabla tiene una nueva fila)
        growl = page.locator(".ui-growl-message")
        if await growl.count() > 0:
            msg = await growl.first.inner_text()
            if 'error' in msg.lower() or 'Error' in msg:
                return False, f"Error en xetux: {msg}"

        print(f"    ✓ Producción cargada")
        return True, "OK"

    except Exception as e:
        return False, str(e)


# ── Carga de merma ────────────────────────────────────────────────────────────

async def cargar_merma(page, merma: dict) -> tuple[bool, str]:
    """
    Carga una merma en xetux.
    Retorna (exito, mensaje)
    """
    print(f"\n  → Merma {merma['id']}: {merma['articulo_nombre']} × {merma['cantidad']} {merma.get('unidad','')}")

    try:
        await page.goto(url("/logged/inventory/waste/crud.xhtml"), wait_until="networkidle")
        await asyncio.sleep(2)

        dialog = page.locator("#loginDialog")
        if await dialog.count() > 0 and await dialog.is_visible():
            await page.goto(url("/logged/inventory/waste/crud.xhtml"), wait_until="networkidle")
            await asyncio.sleep(2)

        # 1. Seleccionar artículo (autocomplete #itemSelect_input)
        item_input = page.locator("#itemSelect_input")
        await item_input.wait_for(timeout=8000)
        await item_input.fill(merma['articulo_nombre'][:20])
        await asyncio.sleep(1.5)
        panel = page.locator(".ui-autocomplete-panel .ui-autocomplete-item")
        if await panel.count() > 0:
            await panel.first.click()
        else:
            await item_input.fill(merma['articulo_nombre'])
            await asyncio.sleep(1.5)
            panel = page.locator(".ui-autocomplete-panel .ui-autocomplete-item")
            if await panel.count() > 0:
                await panel.first.click()
            else:
                return False, f"Artículo '{merma['articulo_nombre']}' no encontrado en xetux"
        await asyncio.sleep(1)

        # 2. Seleccionar almacén
        almacen = merma.get('almacen', '')
        if almacen:
            await page.evaluate(f"""(() => {{
                var sel = document.getElementById('warehouseSelected_input');
                if (!sel) return;
                for (var i = 0; i < sel.options.length; i++) {{
                    if (sel.options[i].text.trim().toUpperCase() === '{almacen.upper()}') {{
                        sel.selectedIndex = i;
                        sel.dispatchEvent(new Event('change', {{bubbles: true}}));
                        try {{ PF('warehouseSelected').selectValue(sel.options[i].value); }} catch(e) {{}}
                        break;
                    }}
                }}
            }})()""")
            await asyncio.sleep(0.8)

        # 3. Cantidad
        qty_input = page.locator("#bodyQuantityInput_input")
        if await qty_input.count() == 0:
            qty_input = page.locator("#quantityC_input")
        await qty_input.wait_for(timeout=5000)
        await qty_input.fill('')
        await qty_input.type(str(merma['cantidad']))
        await qty_input.dispatch_event('keyup')
        await asyncio.sleep(0.8)

        # 4. Motivo
        motivo = merma.get('motivo') or merma.get('motivo_texto') or ''
        if motivo:
            reason_sel = page.locator("select[id*='reason'], select[id*='motivo']")
            if await reason_sel.count() > 0:
                await page.evaluate(f"""(() => {{
                    var sel = document.querySelector("select[id*='reason'], select[id*='motivo']");
                    if (!sel) return;
                    for (var i = 0; i < sel.options.length; i++) {{
                        if (sel.options[i].text.trim().toLowerCase().includes('{motivo[:15].lower()}')) {{
                            sel.selectedIndex = i;
                            sel.dispatchEvent(new Event('change', {{bubbles: true}}));
                            break;
                        }}
                    }}
                }})()""")
                await asyncio.sleep(0.5)

        # 5. Fecha
        fecha_merma = merma.get('fecha', '')
        if fecha_merma:
            fecha_fmt = fmt_fecha(fecha_merma)
            await page.evaluate(f"""(() => {{
                try {{
                    var el = document.getElementById('wasteDateInput_input');
                    if (el) {{
                        el.value = '{fecha_fmt}';
                        el.dispatchEvent(new Event('change', {{bubbles: true}}));
                    }}
                }} catch(e) {{}}
            }})()""")
            await asyncio.sleep(0.5)

        # 6. Encargado
        encargado_input = page.locator("#taskedEmployeeSelected_input")
        if await encargado_input.count() > 0:
            await encargado_input.fill(POS_USER)
            await asyncio.sleep(0.5)
            panel_enc = page.locator(".ui-autocomplete-panel .ui-autocomplete-item")
            if await panel_enc.count() > 0:
                await panel_enc.first.click()
            await asyncio.sleep(0.5)

        # 7. Guardar (j_idt159 según HTML explorado)
        save_btn = page.locator("#j_idt159")
        if await save_btn.count() == 0:
            save_btn = page.locator("button:visible").filter(has_text="Guardar")
        if await save_btn.count() == 0:
            return False, "Botón Guardar no encontrado"

        await save_btn.click()
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(3)

        growl = page.locator(".ui-growl-message")
        if await growl.count() > 0:
            msg = await growl.first.inner_text()
            if 'error' in msg.lower():
                return False, f"Error en xetux: {msg}"

        print(f"    ✓ Merma cargada")
        return True, "OK"

    except Exception as e:
        return False, str(e)


# ── Runner principal ──────────────────────────────────────────────────────────

async def run(cargar_prods: bool, cargar_mermas: bool,
              prod_id: str | None, merma_id: str | None) -> None:

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await login(page)

        # ── Producciones ──
        if cargar_prods or prod_id:
            print("\n→ Cargando producciones a xetux...")
            if prod_id:
                prods_data = worker_get(f"/producciones/{prod_id}")
                producciones = [prods_data['produccion']] if prods_data.get('ok') else []
            else:
                prods_data = worker_get("/producciones?estado=autorizado")
                producciones = prods_data.get('producciones', [])

            print(f"  {len(producciones)} producción(es) a cargar")
            for prod in producciones:
                exito, msg = await cargar_produccion(page, prod)
                worker_post('/xetux/produccion-cargada', {
                    'id': prod['id'],
                    'exito': exito,
                    'error_msg': msg if not exito else None,
                })
                if not exito:
                    print(f"    ✗ Error: {msg}")

        # ── Mermas ──
        if cargar_mermas or merma_id:
            print("\n→ Cargando mermas a xetux...")
            if merma_id:
                merma_data = worker_get(f"/mermas?estado=pendiente")
                mermas = [m for m in merma_data.get('mermas', []) if m['id'] == merma_id]
            else:
                merma_data = worker_get("/mermas?estado=pendiente")
                mermas = merma_data.get('mermas', [])

            print(f"  {len(mermas)} merma(s) a cargar")
            for merma in mermas:
                exito, msg = await cargar_merma(page, merma)
                worker_post('/xetux/merma-cargada', {
                    'id': merma['id'],
                    'exito': exito,
                    'error_msg': msg if not exito else None,
                })
                if not exito:
                    print(f"    ✗ Error: {msg}")

        await browser.close()
    print("\nCarga completada.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--producciones',  action='store_true')
    parser.add_argument('--mermas',        action='store_true')
    parser.add_argument('--todo',          action='store_true')
    parser.add_argument('--produccion-id', dest='produccion_id')
    parser.add_argument('--merma-id',      dest='merma_id')
    args = parser.parse_args()

    asyncio.run(run(
        cargar_prods  = args.todo or args.producciones,
        cargar_mermas = args.todo or args.mermas,
        prod_id       = args.produccion_id,
        merma_id      = args.merma_id,
    ))


if __name__ == '__main__':
    main()
