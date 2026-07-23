#!/usr/bin/env python3
"""Smoke R12 — guard de versión en inventario.html (Worker stubeado).
A) minAppVersion alto → pantalla de bloqueo al entrar + reload con ?v=.
B) sync 426 → banner persistente, sin perder captura local.
C) minAppVersion == APP_VERSION → flujo normal (regresión R11b: botón desglose)."""
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright

PORT = 8892
BASE = f"http://localhost:{PORT}/inventario.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"

PLANTILLA = {
    "ok": True, "found": True,
    "rowMap": {"V1": 10}, "cantidadColIdx": 7,
    "presMap": {"V1": [{"nombre": "BOTELLA", "factor": 0.75}, {"nombre": "MAGNUM", "factor": 1.5}]},
    "unitMap": {"V1": "LT"}, "defaultPres": {},
    "templateHash": "smoke12", "raw": None,
}
ARTICULOS = {"articulos": [{"codigo": "V1", "nombre": "VINO GUARD", "unidad": "LT", "grupo": "VINOS"}]}

passed = 0
def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}"); sys.exit(1)
    passed += 1
    print(f"✓ {msg}")

def make_stub(min_ver, reject_posts):
    def stub(route):
        url, method = route.request.url, route.request.method
        if method == "POST" and "/inv/sesion" in url:
            if reject_posts:
                route.fulfill(status=426, json={"ok": False, "appUpdateRequired": True, "minAppVersion": min_ver})
            else:
                route.fulfill(json={"ok": True})
        elif "/inv/plantilla" in url:
            route.fulfill(json={**PLANTILLA, "minAppVersion": min_ver})
        elif "/inv/zone-config" in url:
            route.fulfill(json={"ok": True, "found": False})
        elif "/inv/sesiones" in url:
            route.fulfill(json={"ok": True, "sesiones": [], "minAppVersion": min_ver})
        elif "/articulos" in url:
            route.fulfill(json=ARTICULOS)
        else:
            route.fulfill(json={"ok": True, "found": False})
    return stub

def entrar(page):
    page.select_option("#area-select", "CAVA")
    page.click("text=Continuar →")
    page.wait_for_timeout(400)

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd="/home/lilp/proyectos", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # --- A: app vieja según el Worker → bloqueo al entrar
        page = browser.new_page()
        page.route(WORKER + "/**", make_stub(99, False))
        page.goto(BASE)
        entrar(page)
        ok(page.locator("text=Hay una versión nueva de la app").count() == 1, "A: pantalla de bloqueo al entrar")
        ok(page.locator("text=Actualizar ahora").count() == 1, "A: botón Actualizar ahora")
        page.click("text=Actualizar ahora")
        page.wait_for_timeout(500)
        ok("v=" in page.url, f"A: recarga con cache-bust (?v=) → {page.url.split('?')[1][:20]}…")
        page.close()

        # --- B: entra bien (min == APP_VERSION) pero el sync es rechazado → banner
        page = browser.new_page()
        page.on("dialog", lambda d: d.accept())
        page.route(WORKER + "/**", make_stub(1, True))
        page.goto(BASE)
        entrar(page)
        ok(page.locator("text=Iniciar nueva toma →").count() == 1, "B: min==APP_VERSION entra normal")
        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "R12 Smoke")
        page.click("text=Iniciar →")
        page.wait_for_timeout(300)   # startSession dispara syncSesionWorker → 426
        ok(page.locator("#update-banner").count() == 1, "B: banner tras sync 426")
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        page.fill('input.qty-input[data-cod="V1"]:not(.desg-input)', "3")
        page.wait_for_timeout(100)
        ok(page.evaluate("Object.values(S.countsByZone)[0]['V1']") == 3,
           "B: la captura sigue guardándose local aunque el sync rebote")
        page.close()

        # --- C: flujo normal intacto (regresión R11b)
        page = browser.new_page()
        page.route(WORKER + "/**", make_stub(1, False))
        page.goto(BASE)
        entrar(page)
        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "R12 Normal")
        page.click("text=Iniciar →")
        page.wait_for_timeout(200)
        ok(page.locator("#update-banner").count() == 0, "C: sin banner con sync aceptado")
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        ok(page.locator('.desg-btn[data-cod="V1"]').count() == 1, "C: botón desglose R11b sigue ahí")
        browser.close()
    print(f"\n✅ smoke R12: {passed} asserts OK")
finally:
    srv.terminate()
