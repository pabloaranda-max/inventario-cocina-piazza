#!/usr/bin/env python3
"""Smoke R11b — desglose por presentación en inventario.html.

Sirve el repo local y stubea el Worker con page.route. Flujo:
CAVA → nueva toma → zona 0 → desglosar V1 (siembra + 3 líneas) →
quitar desglose en V2 → camino legacy intacto → validación → reload persiste.
"""
import json, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

PORT = 8891
BASE = f"http://localhost:{PORT}/inventario.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"

PLANTILLA = {
    "ok": True, "found": True,
    "rowMap": {"V1": 10, "V2": 11, "D1": 12},
    "cantidadColIdx": 7,
    "presMap": {"V1": [{"nombre": "BOTELLA", "factor": 0.75},
                        {"nombre": "MAGNUM", "factor": 1.5}]},
    "unitMap": {"V1": "LT", "V2": "LT", "D1": "KG"},
    "defaultPres": {"LT": [{"nombre": "BOTELLA 0.75", "factor": 0.75}]},
    "templateHash": "smokehash", "raw": None,
}
ARTICULOS = {"articulos": [
    {"codigo": "V1", "nombre": "VINO TESTO", "unidad": "LT", "grupo": "VINOS"},
    {"codigo": "V2", "nombre": "VINO SEGUNDO", "unidad": "LT", "grupo": "VINOS"},
    {"codigo": "D1", "nombre": "QUESO DIRECTO", "unidad": "KG", "grupo": "QUESOS"},
]}

passed = 0
def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}"); sys.exit(1)
    passed += 1
    print(f"✓ {msg}")

def stub(route):
    url = route.request.url
    if "/inv/plantilla" in url:
        route.fulfill(json=PLANTILLA)
    elif "/inv/zone-config" in url:
        route.fulfill(json={"ok": True, "found": False})
    elif "/inv/sesiones" in url:
        route.fulfill(json={"ok": True, "sesiones": []})
    elif "/inv/sesion" in url:
        if route.request.method == "POST":
            route.fulfill(json={"ok": True})
        else:
            route.fulfill(json={"ok": True, "found": False})
    elif "/articulos" in url:
        route.fulfill(json=ARTICULOS)
    else:
        route.fulfill(json={"ok": True})

def entrar_a_zona(page):
    page.goto(BASE)
    page.select_option("#area-select", "CAVA")
    page.click("text=Continuar →")
    page.wait_for_timeout(400)

srv = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)],
    cwd="/home/lilp/proyectos",
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("dialog", lambda d: d.accept())
        page.route(WORKER + "/**", stub)

        entrar_a_zona(page)
        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "Smoke R11")
        page.click("text=Iniciar →")
        page.wait_for_timeout(200)
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)

        # --- fila V1: botón desglosar visible; D1 (sin presentaciones) no lo tiene
        ok(page.locator('.desg-btn[data-cod="V1"]').count() == 1, "V1 tiene botón desglosar")
        ok(page.locator('.desg-btn[data-cod="D1"]').count() == 0, "D1 (sin pres) no tiene botón")

        # --- capturar 2 en V1 (legacy) y desglosar: siembra en BOTELLA 0.75
        page.fill('input.qty-input[data-cod="V1"]:not(.desg-input)', "2")
        page.click('.desg-btn[data-cod="V1"]')
        page.wait_for_timeout(100)
        blk = page.locator('.item-row.desglosado:has(.desg-input[data-cod="V1"])')
        ok(blk.count() == 1, "V1 quedó desglosado")
        seed = page.input_value('.desg-input[data-cod="V1"][data-f="0.75"]')
        ok(seed == "2", f"número previo sembrado en BOTELLA 0.75 (q={seed})")
        ok(page.locator('.desg-input[data-cod="V1"]').count() == 3,
           "3 líneas: BOTELLA + MAGNUM + abierto")

        # --- llenar MAGNUM 1 y abierto 0.3 → total 2*0.75 + 1*1.5 + 0.3 = 3.3
        page.fill('.desg-input[data-cod="V1"][data-f="1.5"]', "1")
        page.fill('.desg-input[data-cod="V1"][data-f="1"]', "0.3")
        page.wait_for_timeout(100)
        tot = page.locator('[id^="dtot_"][id$="_V1"]').inner_text()
        ok(tot == "3.3", f"total desglose = {tot} (esperado 3.3)")
        badge = page.locator('[id^="ltb_"][id$="_V1"]').inner_text()
        ok(badge == "3.3 LT", f"badge = {badge}")
        val = page.evaluate("Object.values(S.countsByZone)[0]['V1']")
        ok(isinstance(val, list) and len(val) == 3, f"D1 local: V1 es array de 3 líneas → {json.dumps(val)}")

        # --- V2: número legacy → desglosar siembra → quitar desglose borra la clave
        page.fill('input.qty-input[data-cod="V2"]:not(.desg-input)', "4")
        page.click('.desg-btn[data-cod="V2"]')
        page.wait_for_timeout(100)
        ok(page.input_value('.desg-input[data-cod="V2"][data-f="0.75"]') == "4",
           "V2 sembrado en su defaultPres 0.75")
        page.click('.desg-cerrar[data-cod="V2"]')  # confirm auto-aceptado
        page.wait_for_timeout(100)
        v2 = page.evaluate("Object.values(S.countsByZone)[0]['V2']")
        ok(v2 is None, "quitar desglose borró la clave de V2")
        ok(page.locator('.desg-input[data-cod="V2"]').count() == 0, "V2 volvió a fila simple")

        # --- camino simple intacto: V2 = 4 como número
        page.fill('input.qty-input[data-cod="V2"]:not(.desg-input)', "4")
        page.wait_for_timeout(100)
        v2 = page.evaluate("Object.values(S.countsByZone)[0]['V2']")
        ok(v2 == 4, f"V2 legacy sigue siendo número ({v2})")

        # --- validación: totales polimórficos + conteo de desglosados
        page.evaluate("go('generate')")
        page.wait_for_timeout(100)
        vtxt = page.locator("#validation-out").inner_text()
        ok("2 artículos con cantidad" in vtxt, "validación: 2 artículos con cantidad")
        ok("1 con desglose" in vtxt, "validación: 1 con desglose")

        # --- persistencia: reload → continuar toma → fila V1 sigue desglosada
        page.reload()
        page.select_option("#area-select", "CAVA")
        page.click("text=Continuar →")
        page.wait_for_timeout(400)
        page.click("text=Continuar →")   # tarjeta "Toma del ..."
        page.wait_for_timeout(200)
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        ok(page.locator('.desg-input[data-cod="V1"]').count() == 3,
           "tras reload V1 renderiza desglosado desde la sesión")
        ok(page.input_value('.desg-input[data-cod="V1"][data-f="1.5"]') == "1",
           "líneas persistidas (MAGNUM=1)")
        ok(page.locator('[id^="ltb_"][id$="_V1"]').inner_text() == "3.3 LT",
           "badge correcto tras reload")

        browser.close()
    print(f"\n✅ smoke R11b: {passed} asserts OK")
finally:
    srv.terminate()
