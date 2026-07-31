#!/usr/bin/env python3
"""Smoke R21 — fecha CDMX, catálogo completo por zona y cierre inequívoco.

Fija el navegador en 2026-08-01 03:30 UTC (2026-07-31 21:30 CDMX), sirve la
app local y stubea el Worker. Verifica que un artículo fuera de la preparación
se capture en la zona actual, que el cierre quede claramente marcado y que se
pueda reabrir.
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


PORT = 8899
BASE = f"http://localhost:{PORT}/inventario.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
ROOT = Path("/home/lilp/proyectos")

PLANTILLA = {
    "ok": True,
    "found": True,
    "rowMap": {"A1": 10, "B2": 11, "C3": 12},
    "cantidadColIdx": 7,
    "presMap": {},
    "unitMap": {"A1": "PZA", "B2": "PZA", "C3": "PZA"},
    "defaultPres": {},
    "templateHash": "smoke-r21",
    "raw": None,
}

ZONE_CONFIG = {
    "ok": True,
    "found": True,
    "id": "cfg-r21",
    "templateHash": "smoke-r21",
    "zones": [
        {
            "nombre": "Zona Uno",
            "color": "#667eea",
            "items": [{"cod": "A1", "orden": 10, "activo": True}],
        },
        {
            "nombre": "Zona Dos",
            "color": "#10b981",
            "items": [{"cod": "B2", "orden": 10, "activo": True}],
        },
    ],
}

ARTICULOS = {
    "articulos": [
        {"codigo": "A1", "nombre": "ARTICULO PRINCIPAL", "unidad": "PZA", "grupo": "BASE"},
        {"codigo": "B2", "nombre": "ARTICULO OTRA PREPARACION", "unidad": "PZA", "grupo": "BASE"},
        {"codigo": "C3", "nombre": "ARTICULO TRES NO PREPARADO", "unidad": "PZA", "grupo": "BASE"},
    ]
}

passed = 0


def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}")
        sys.exit(1)
    passed += 1
    print(f"✓ {msg}")


def stub(route):
    url = route.request.url
    if "/inv/plantilla" in url:
        route.fulfill(json=PLANTILLA)
    elif "/inv/zone-config" in url:
        route.fulfill(json=ZONE_CONFIG)
    elif "/inv/sesiones" in url:
        route.fulfill(json={"ok": True, "sesiones": [], "minAppVersion": 1})
    elif "/inv/sesion" in url:
        if route.request.method == "POST":
            route.fulfill(json={"ok": True})
        else:
            route.fulfill(json={"ok": True, "found": False})
    elif "/inv/lock" in url:
        route.fulfill(json={"ok": True})
    elif "/articulos" in url:
        route.fulfill(json=ARTICULOS)
    else:
        route.fulfill(json={"ok": True})


FIXED_DATE_SCRIPT = """
(() => {
  const RealDate = Date;
  const fixed = RealDate.parse('2026-08-01T03:30:00Z');
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(fixed);
    }
    static now() { return fixed; }
  }
  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;
  window.Date = MockDate;
})();
"""


server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)],
    cwd=ROOT,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
time.sleep(1)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        dialogs = []

        def accept_dialog(dialog):
            dialogs.append(dialog.message)
            dialog.accept()

        page.on("dialog", accept_dialog)
        page.add_init_script(FIXED_DATE_SCRIPT)
        page.route(WORKER + "/**", stub)
        page.goto(BASE)

        ok(
            page.input_value("#inp-fecha") == "2026-07-31",
            "21:30 CDMX conserva 2026-07-31 aunque UTC ya sea 2026-08-01",
        )
        ok(
            page.evaluate("fechaOperativaCDMX(new Date())") == "2026-07-31",
            "helper de fecha operativa devuelve el día de CDMX",
        )

        page.select_option("#area-select", "CAVA")
        page.click("text=Continuar →")
        page.wait_for_timeout(300)
        ok(page.input_value("#inp-fecha") == "2026-07-31", "seleccionar almacén no cambia la fecha CDMX")

        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "Smoke R21")
        page.click("text=Iniciar →")
        page.wait_for_timeout(200)
        page.evaluate("startCount(0)")
        page.wait_for_timeout(150)

        ok(
            page.get_attribute("#count-search", "placeholder") == "Buscar en toda la plantilla…",
            "el buscador declara que consulta toda la plantilla",
        )
        page.fill("#count-search", "articulo tres")
        page.wait_for_timeout(100)
        extra_header = page.locator("#count-extra .subgrupo-hdr").inner_text()
        ok(
            "DISPONIBLES EN ESTA ZONA" in extra_header,
            "artículo no preparado aparece como disponible en la zona actual",
        )
        ok(page.locator("text=Otras zonas").count() == 0, "la búsqueda ya no atribuye el artículo a otra zona")
        extra_input = page.locator('#count-extra input.qty-input[data-cod="C3"]')
        ok(extra_input.count() == 1, "el artículo fuera de preparación conserva captura normal")
        page.fill('#count-extra input.qty-input[data-cod="C3"]', "7")
        ok(
            page.evaluate("S.countsByZone[myZoneKey(0)].C3") == 7,
            "el artículo adicional se guarda bajo la zona que se está contando",
        )
        ok("+1" in page.locator("#count-pct").inner_text(), "el avance reconoce un artículo adicional")

        page.click(".search-bar button")
        page.fill('#count-list input.qty-input[data-cod="A1"]', "2")
        page.click("button:has-text('Cerrar esta zona')")
        page.wait_for_timeout(200)

        close_message = dialogs[-1]
        ok("marcada en verde como CERRADA" in close_message, "la confirmación explica el estado CERRADA")
        ok("1 artículo adicional" in close_message, "la confirmación incluye capturas fuera de preparación")
        ok(page.locator(".zone-card.done").count() == 1, "la zona cerrada conserva estado visual persistente")
        ok(
            page.locator(".zone-card.done .zone-status-closed").inner_text() == "✓ CERRADA",
            "la tarjeta muestra badge textual CERRADA",
        )
        ok(
            "Toca para reabrir y modificar" in page.locator(".zone-card.done .zone-meta").inner_text(),
            "la tarjeta explica que aún se puede modificar",
        )
        ok(
            "servidor recibió la zona" in page.locator("#ov-feedback").inner_text(),
            "el cierre muestra confirmación visible aun si un Worker viejo no emite acuse",
        )

        page.click(".zone-card.done")
        page.wait_for_timeout(150)
        ok(
            "dejará de aparecer como CERRADA" in dialogs[-1],
            "reabrir explica con claridad el cambio de estado",
        )
        ok(
            page.evaluate("!S.completedZones.includes(myZoneKey(0))"),
            "reabrir elimina el estado cerrado y entra de nuevo al conteo",
        )

        browser.close()

    worker_source = (ROOT / "worker/operaciones-api/src/index.js").read_text()
    ok(
        "const desde = fechaOperativaCDMX(" in worker_source,
        "el filtro de sesiones recientes del Worker usa fecha CDMX",
    )
    print(f"\n✅ smoke R21: {passed} asserts OK")
finally:
    server.terminate()
