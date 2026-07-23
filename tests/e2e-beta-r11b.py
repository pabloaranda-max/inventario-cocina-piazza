#!/usr/bin/env python3
"""E2E R11b contra la BETA publicada + Worker STAGING (sin stubs) — el Done de §15:
desglosar un artículo con 2 presentaciones + abierto, cerrar zona, validación y
totales correctos; camino simple intacto (número en D1)."""
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BETA = "https://pabloaranda-max.github.io/inventario-cocina-piazza/inventario-beta.html"
STAGING = "https://operaciones-api-staging.pablo-aranda.workers.dev"
COD_MULTI = "XMAT2408000049"   # BOTELLA 1.5 / BOTELLA DE 750 ML 0.75
FECHA = time.strftime("%Y-%m-%d")

passed = 0
def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}"); sys.exit(1)
    passed += 1
    print(f"✓ {msg}")

def api(path):
    req = urllib.request.Request(STAGING + path, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"})
    return json.load(urllib.request.urlopen(req))

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.on("dialog", lambda d: d.accept())

    page.goto(BETA)
    ok("[BETA]" in page.title(), "página beta cargada")
    page.select_option("#area-select", "CAVA")
    page.click("text=Continuar →")
    page.wait_for_timeout(2500)   # plantilla + catálogo reales de staging

    # puede haber toma abierta previa en staging → "Ignorar" si aparece
    if page.locator("text=Ignorar").count():
        page.click("text=Ignorar")
        page.wait_for_timeout(300)
    page.click("text=Iniciar nueva toma →")
    page.fill("#inp-operario", "Beta R11")
    page.click("text=Iniciar →")
    page.wait_for_timeout(500)
    page.evaluate("startCount(0)")
    page.wait_for_timeout(1000)

    zid = page.evaluate("myZoneKey(0)")

    # --- desglose en artículo con 2 presentaciones
    sel = f'.desg-btn[data-cod="{COD_MULTI}"]'
    ok(page.locator(sel).count() == 1, "artículo multi-presentación tiene botón desglosar")
    page.click(sel)
    page.wait_for_timeout(200)
    ok(page.locator(f'.desg-input[data-cod="{COD_MULTI}"]').count() == 3,
       "3 líneas: 1.5 + 0.75 + abierto")
    page.fill(f'.desg-input[data-cod="{COD_MULTI}"][data-f="0.75"]', "2")
    page.fill(f'.desg-input[data-cod="{COD_MULTI}"][data-f="1.5"]', "1")
    page.fill(f'.desg-input[data-cod="{COD_MULTI}"][data-f="1"]', "0.3")
    page.wait_for_timeout(200)
    tot = page.locator(f'[id^="dtot_"][id$="_{COD_MULTI}"]').inner_text()
    ok(tot == "3.3", f"total desglose {tot} (2×0.75 + 1×1.5 + 0.3 = 3.3)")

    # --- camino simple: primer artículo con 1 presentación → número
    cod_simple = page.evaluate(
        "ZONAS[0].items.map(i=>i.cod).find(c => c !== '%s' && getPresOptions(c).length === 1)" % COD_MULTI)
    ok(bool(cod_simple), f"artículo simple elegido: {cod_simple}")
    page.fill(f'input.qty-input[data-cod="{cod_simple}"]:not(.desg-input)', "4")
    page.wait_for_timeout(200)

    # --- cerrar zona (confirm auto-aceptado) y validación
    page.evaluate("doneZone()")
    page.wait_for_timeout(1000)
    page.evaluate("go('generate')")
    page.wait_for_timeout(300)
    vtxt = page.locator("#validation-out").inner_text()
    ok("2 artículos con cantidad" in vtxt, "validación: 2 artículos con cantidad")
    ok("1 con desglose" in vtxt, "validación: 1 con desglose")

    # --- sync final y verificación en D1 staging
    page.evaluate("syncSesionWorker()")
    page.wait_for_timeout(2500)
    browser.close()

d = api(f"/inv/sesion?almacen=CAVA&fecha={FECHA}")
ok(d.get("ok") and d.get("found"), f"sesión CAVA {FECHA} existe en D1 staging")
counts = None
for k, zc in (d.get("countsByZone") or {}).items():
    if COD_MULTI in (zc or {}):
        counts = zc; break
ok(counts is not None, "zona con el conteo encontrada en D1")
val = counts[COD_MULTI]
ok(isinstance(val, list) and len(val) == 3, f"D1: array de 3 líneas → {json.dumps(val)}")
suma = sum(float(l["q"]) * float(l["f"]) for l in val)
ok(abs(suma - 3.3) < 1e-9, f"D1: Σ q×f = {suma}")
ok(counts.get(cod_simple) == 4, f"D1: camino simple intacto ({cod_simple} = {counts.get(cod_simple)!r}, número)")

print(f"\n✅ E2E beta+staging R11b: {passed} asserts OK")
