#!/usr/bin/env python3
"""Exporta una toma partida en dos fechas y valida el XLSX y ambos inv_export."""
import base64
import json
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright


PORT = 8895
BASE = f"http://localhost:{PORT}/admin.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
FIXTURE = "/home/lilp/proyectos/tests/fixtures/cava-synthetic.xlsx"
ROW_MAP = {
    "MP0001": 1, "MP0002": 3, "MP0003": 5, "MP0004": 7,
    "MP0005": 9, "MP0006": 11, "MP0007": 14, "MP0008": 15,
}

with open(FIXTURE, "rb") as fixture_file:
    RAW = base64.b64encode(fixture_file.read()).decode()

SESIONES = {
    "2026-08-09": {
        "ok": True, "found": True, "fecha": "2026-08-09",
        "operario": "Noche", "templateHash": "stub-tramos",
        "countsByZone": {"0:devN": {"MP0001": 2}},
        "presChoiceByZone": {}, "correctionsByZone": {}, "manuales": [],
        "completedZones": ["0:devN"],
        "zoneSnapshot": [{"nombre": "Rack"}, {"nombre": "Reserva"}],
        "operariosByDevice": {"devN": {"operario": "Noche"}},
    },
    "2026-08-10": {
        "ok": True, "found": True, "fecha": "2026-08-10",
        "operario": "Mañana", "templateHash": "stub-tramos",
        "countsByZone": {"1:devM": {"MP0007": 3}},
        "presChoiceByZone": {}, "correctionsByZone": {}, "manuales": [],
        "completedZones": ["1:devM"],
        "zoneSnapshot": [{"nombre": "Rack"}, {"nombre": "Reserva"}],
        "operariosByDevice": {"devM": {"operario": "Mañana"}},
    },
}

PLANTILLA = {
    "ok": True, "found": True, "raw": RAW, "rowMap": ROW_MAP,
    "cantidadColIdx": 7, "templateHash": "stub-tramos",
    "presMap": {}, "unitMap": {}, "defaultPres": {},
    "originalFilename": "cava-synthetic.xlsx", "minAppVersion": 1,
}


def check(condition, message):
    if not condition:
        print(f"❌ {message}")
        raise SystemExit(1)
    print(f"✓ {message}")


class Stub:
    def __init__(self):
        self.exports = []

    def __call__(self, route):
        request = route.request
        parsed = urlparse(request.url)
        if request.method == "POST":
            body = json.loads(request.post_data or "{}")
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True})
            elif body.get("action") == "inv_export":
                self.exports.append(body)
                route.fulfill(json={"ok": True})
            else:
                route.fulfill(json={"ok": True})
        elif parsed.path.endswith("/inv/sesiones"):
            route.fulfill(json={
                "ok": True, "minAppVersion": 1,
                "sesiones": [
                    {"almacen": "CAVA", "fecha": fecha, "operario": sesion["operario"],
                     "updatedAt": f"{fecha}T23:59:00Z", "exportedAt": ""}
                    for fecha, sesion in SESIONES.items()
                ],
            })
        elif parsed.path.endswith("/inv/sesion"):
            fecha = parse_qs(parsed.query).get("fecha", [""])[0]
            route.fulfill(json=SESIONES.get(fecha, {"ok": True, "found": False}))
        elif parsed.path.endswith("/inv/plantilla"):
            route.fulfill(json=PLANTILLA)
        elif parsed.path.endswith("/articulos"):
            route.fulfill(json={"ok": True, "articulos": []})
        else:
            route.fulfill(json={"ok": True})


server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)],
    cwd="/home/lilp/proyectos", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        dialogs = []
        page.on("dialog", lambda dialog: (dialogs.append((dialog.type, dialog.message)), dialog.accept()))
        stub = Stub()
        page.route(WORKER + "/**", stub)
        page.goto(BASE)
        page.fill("#nombre-input", "Auditora")
        page.fill("#pwd-input", "x")
        page.click(".btn-login")
        page.wait_for_selector(".toma-card")

        # "Generar XLSX y enviar" y "Cerrar con plantilla fresca" se fundieron en un
        # solo botón "Exportar" que pregunta con qué plantilla. Este caso usa la
        # guardada, que es el camino que este smoke venía ejercitando.
        page.locator(".toma-card").first.locator("button").filter(has_text="Exportar").click()
        page.wait_for_selector("#modal-plantilla-export", state="visible")
        page.click("[onclick=\"plxElegir('guardada')\"]")
        page.wait_for_selector("#modal-archivo", state="visible", timeout=15000)

        confirms = [message for kind, message in dialogs if kind == "confirm"]
        check(any("partido en 2 tramos" in message for message in confirms),
              "la unión de fechas se confirma explícitamente")
        check(any("Se escriben 2 de los 8" in message for message in confirms),
              "la cobertura se calcula sobre los dos tramos")
        check([export["fecha"] for export in stub.exports] == ["2026-08-09", "2026-08-10"],
              "ambas filas D1 quedan marcadas como exportadas")
        check(all(not export["force"] for export in stub.exports),
              "una toma nueva marca ambos tramos sin forzar reexportación")

        values = page.evaluate("""() => {
          const wb = XLSX.read(_archivoXetux.bytes, { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const value = (row, col) => ws[XLSX.utils.encode_cell({ r:row, c:col })]?.v;
          return { noche:value(1, 7), manana:value(14, 7) };
        }""")
        check(values == {"noche": 2, "manana": 3},
              "el XLSX conserva cantidades de ambos lados de la medianoche")
        check("09/08/2026 y 10/08/2026" in page.locator("#modal-archivo").inner_text(),
              "el modal identifica el rango unido")
        check(not any(kind == "alert" for kind, _ in dialogs),
              "la ruta combinada termina sin alertas de error")
        browser.close()
finally:
    server.terminate()

print("\n✅ smoke export de tramos: XLSX unido + dos marcas OK")
