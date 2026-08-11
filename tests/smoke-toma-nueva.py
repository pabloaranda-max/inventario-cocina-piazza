#!/usr/bin/env python3
"""Smoke — cada equipo abre su propia toma; ninguna se adopta.

Antes, un dispositivo sin sesión local podía "Continuar esta toma" y adoptar la
del servidor: eso reemplazaba la sesión local y arrastraba zoneSnapshot y
candados ajenos. Regla vigente: el equipo cuenta lo suyo y el admin decide qué
es un solo conteo (une los tramos de días contiguos al imprimir y al exportar).

Verifica que:
  A) no queda ninguna vía para cargar la toma del servidor,
  B) el aviso informa sin ofrecer acción,
  C) una toma nueva sobre un almacén con toma del día hereda su MAPA de zonas
     (no sus conteos), para que `zonaIdx:dispositivo` signifique lo mismo,
  D) sigue leyéndose el servidor para los candados de zona.
"""
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PORT = 8901
BASE = f"http://localhost:{PORT}/inventario.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
ROOT = Path("/home/lilp/proyectos")
HOY = "2026-08-10"          # 2026-08-11T03:30Z = 21:30 CDMX del 10
AYER = "2026-08-09"

PLANTILLA = {
    "ok": True, "found": True,
    "rowMap": {"A1": 10, "B2": 11},
    "cantidadColIdx": 7, "presMap": {},
    "unitMap": {"A1": "PZA", "B2": "PZA"},
    "defaultPres": {}, "templateHash": "smoke-tn", "raw": None,
}

# La preparación ACTIVA cambió de nombres y orden respecto a la toma en curso:
# si el equipo nuevo contara con esta, su "zona 0" no sería la del servidor.
ZONE_CONFIG = {
    "ok": True, "found": True, "id": "cfg-nuevo", "templateHash": "smoke-tn",
    "zones": [
        {"nombre": "Preparacion NUEVA 0", "color": "#667eea",
         "items": [{"cod": "A1", "orden": 10, "activo": True}]},
        {"nombre": "Preparacion NUEVA 1", "color": "#10b981",
         "items": [{"cod": "B2", "orden": 10, "activo": True}]},
    ],
}

# La toma de hoy congeló otro mapa de zonas y ya tiene conteo de otro equipo.
SNAPSHOT_CONGELADO = [
    {"nombre": "Congelada Almacen", "color": "#667eea",
     "items": [{"cod": "A1", "orden": 10, "activo": True}]},
    {"nombre": "Congelada Tienda", "color": "#10b981",
     "items": [{"cod": "B2", "orden": 10, "activo": True}]},
]

SESION_DE_HOY = {
    "ok": True, "found": True,
    "operario": "Alexin", "fecha": HOY,
    "countsByZone": {"1:otroequipo": {"A1": 5, "B2": 3}},
    "presChoiceByZone": {}, "correctionsByZone": {},
    "completedZones": ["1:otroequipo"],
    "lockedZones": {"1": {"device_id": "otroequipo", "operario": "Alexin"}},
    "manuales": [], "receipts": [],
    "zoneConfigId": "cfg-congelado", "zoneSnapshot": SNAPSHOT_CONGELADO,
    "operariosByDevice": {"otroequipo": {"operario": "Alexin"}},
    "exportedAt": "", "exportedBy": "", "templateHash": "smoke-tn",
    "updatedAt": "2026-08-10T20:00:00.000Z",
}

LISTADO = {
    "ok": True, "minAppVersion": 1,
    "sesiones": [
        {"almacen": "CAVA", "fecha": HOY, "operario": "Alexin",
         "operarios": ["Alexin"], "articulosContados": 2, "zonasCompletadas": 1,
         "correcciones": 0, "manuales": 0, "comentarios": 0,
         "exportedAt": "", "exportedBy": "",
         "updatedAt": "2026-08-10T20:00:00.000Z"},
        {"almacen": "CAVA", "fecha": AYER, "operario": "Omar",
         "operarios": ["Omar"], "articulosContados": 9, "zonasCompletadas": 0,
         "correcciones": 0, "manuales": 0, "comentarios": 0,
         "exportedAt": "", "exportedBy": "",
         "updatedAt": "2026-08-09T20:00:00.000Z"},
    ],
}

passed = 0


def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}")
        sys.exit(1)
    passed += 1
    print(f"✓ {msg}")


class Stub:
    def __init__(self):
        self.posts = []
        self.hay_sesion_hoy = True

    def __call__(self, route):
        url = route.request.url
        if "/inv/plantilla" in url:
            route.fulfill(json=PLANTILLA)
        elif "/inv/zone-config" in url:
            route.fulfill(json=ZONE_CONFIG)
        elif "/inv/sesiones" in url:
            route.fulfill(json=LISTADO if self.hay_sesion_hoy
                          else {"ok": True, "sesiones": [], "minAppVersion": 1})
        elif "/inv/sesion" in url:
            if route.request.method == "POST":
                self.posts.append(route.request.post_data_json)
                route.fulfill(json={"ok": True})
            elif self.hay_sesion_hoy and f"fecha={HOY}" in url:
                route.fulfill(json=SESION_DE_HOY)
            else:
                route.fulfill(json={"ok": True, "found": False})
        elif "/inv/lock" in url:
            route.fulfill(json={"ok": True})
        else:
            route.fulfill(json={"ok": True})


FECHA_FIJA = """
(() => {
  const RealDate = Date;
  const fixed = RealDate.parse('2026-08-11T03:30:00Z');  // 21:30 CDMX del 10
  class MockDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(fixed); }
    static now() { return fixed; }
  }
  MockDate.parse = RealDate.parse;
  MockDate.UTC = RealDate.UTC;
  window.Date = MockDate;
})();
"""

server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        stub = Stub()

        # ── A y B: equipo nuevo frente a un almacén con toma de hoy ──────────
        page = browser.new_page()
        errores = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.add_init_script(FECHA_FIJA)
        page.route(WORKER + "/**", stub)
        page.goto(BASE)
        page.select_option("#area-select", "CAVA")
        page.click("text=Continuar →")
        page.wait_for_selector("text=Iniciar nueva toma →")

        cuerpo = page.locator("#welcome-body").inner_text()
        ok("Ya hay una toma de hoy" in cuerpo,
           "B: el equipo nuevo se entera de que ya hay toma de hoy")
        ok("Alexin" in cuerpo and "2 artículos" in cuerpo,
           "B: el aviso dice quién cuenta y cuánto lleva")
        ok("se suma al de ellos por zona" in cuerpo,
           "B: explica que su conteo se suma, no compite")
        ok("Hay una toma sin cerrar del 2026-08-09" in cuerpo,
           "B: también avisa del tramo sin cerrar del día anterior")

        ok(page.locator("text=Continuar esta toma").count() == 0,
           "A: no existe el botón de adoptar la toma ajena")
        ok(page.locator("text=Cargar toma del servidor").count() == 0,
           "A: no existe el botón de cargar la toma del servidor")
        ok(page.evaluate("typeof window.loadRemoteSesion") == "undefined",
           "A: la función que adoptaba tomas ya no existe")
        ok(page.evaluate("typeof window.fetchSesionAbiertaWorker") == "undefined",
           "A: la búsqueda de tomas adoptables ya no existe")
        # `let` de módulo: no cuelga de window, se lee por cadena de ámbito.
        ok(page.evaluate("Array.isArray(_tomasAlmacen) && _tomasAlmacen.length === 2"),
           "A: lo que queda es un resumen de solo lectura")
        ok(page.evaluate("_tomasAlmacen.every(t => !('countsByZone' in t))"),
           "A: ese resumen no trae conteos de nadie")

        # ── C: la toma nueva hereda el MAPA de zonas, no los conteos ─────────
        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "Equipo Nuevo")
        page.click("#btn-iniciar-toma")
        page.wait_for_function("() => typeof S !== 'undefined' && !!S", timeout=5000)
        page.wait_for_timeout(400)

        ok(page.evaluate("S.zoneSnapshot.map(z => z.nombre).join('|')")
           == "Congelada Almacen|Congelada Tienda",
           "C: la toma nueva usa el mapa de zonas congelado por la toma de hoy")
        ok(page.evaluate("S.zoneConfigId") == "cfg-congelado",
           "C: y conserva su identificador de preparación")
        ok(page.evaluate("Object.keys(S.countsByZone).length") == 0,
           "C: NO hereda ningún conteo: la toma nace vacía")
        ok(page.evaluate("(S.completedZones || []).length") == 0,
           "C: tampoco hereda zonas cerradas ajenas")
        ok(page.evaluate("S.operario") == "Equipo Nuevo",
           "C: la toma es de quien la abre, no del operario del servidor")
        ok(page.evaluate("ZONAS.map(z => z.nombre).join('|')")
           == "Congelada Almacen|Congelada Tienda",
           "C: la pantalla de conteo muestra las zonas congeladas")

        # ── D: se sigue LEYENDO el servidor para los candados ────────────────
        page.evaluate("startCount(0)")
        page.wait_for_timeout(150)
        page.evaluate("go('overview')")
        page.evaluate("pollLocks()")
        page.wait_for_timeout(400)
        ok(page.evaluate("!!(_remoteLockedZones && _remoteLockedZones['1'])"),
           "D: el candado de la zona que cuenta el otro equipo sigue llegando")

        ok(not errores, f"sin errores JavaScript ({errores})")
        page.close()

        # ── El almacén sin toma previa no muestra ningún aviso ───────────────
        stub.hay_sesion_hoy = False
        page = browser.new_page()
        page.add_init_script(FECHA_FIJA)
        page.route(WORKER + "/**", stub)
        page.goto(BASE)
        page.select_option("#area-select", "CAVA")
        page.click("text=Continuar →")
        page.wait_for_selector("text=Iniciar nueva toma →")
        cuerpo = page.locator("#welcome-body").inner_text()
        ok("Ya hay una toma de hoy" not in cuerpo,
           "sin toma previa no se inventa ningún aviso")

        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "Solo")
        page.click("#btn-iniciar-toma")
        page.wait_for_function("() => typeof S !== 'undefined' && !!S", timeout=5000)
        ok(page.evaluate("S.zoneSnapshot.map(z => z.nombre).join('|')")
           == "Preparacion NUEVA 0|Preparacion NUEVA 1",
           "sin toma previa se congela la preparación activa, como siempre")

        browser.close()

    print(f"\n✅ smoke toma nueva: {passed} verificaciones OK")
finally:
    server.terminate()
