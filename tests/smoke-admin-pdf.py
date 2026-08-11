#!/usr/bin/env python3
"""PDF admin: autoria multiple por articulo y consolidado por restaurante/fecha."""
import json
import os
import subprocess
import sys
import time
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

PORT = 8897
BASE = f"http://localhost:{PORT}/admin.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"

SESIONES = [
    {"almacen": "COCINA", "operario": "Ana", "fecha": "2026-07-31",
     "updatedAt": "2026-08-01T06:00:00Z", "exportedAt": "2026-08-01T07:00:00Z",
     "exportedBy": "Auditor", "articulosContados": 1, "zonasCompletadas": 1,
     "correcciones": 1, "manuales": 0, "comentarios": 0, "operarios": ["Ana", "Luis"]},
    {"almacen": "CAVA", "operario": "Omar", "fecha": "2026-07-31",
     "updatedAt": "2026-08-01T06:00:00Z", "exportedAt": "",
     "articulosContados": 1, "zonasCompletadas": 1,
     "correcciones": 0, "manuales": 0, "comentarios": 0, "operarios": ["Omar"]},
    {"almacen": "GENERAL", "operario": "Pablo", "fecha": "2026-07-31",
     "updatedAt": "2026-08-01T06:00:00Z", "exportedAt": "",
     "articulosContados": 1, "zonasCompletadas": 0,
     "correcciones": 0, "manuales": 0, "comentarios": 0, "operarios": ["Pablo"]},
]

DETALLES = {
    "COCINA": {
        "ok": True, "found": True, "operario": "Ana", "fecha": "2026-07-31",
        "countsByZone": {"0:devA": {"MP1": 2}, "0:devB": {"MP1": 3}},
        "presChoiceByZone": {},
        "correctionsByZone": {"_admin": {"MP1": {
            "qty": 6, "operario": "Auditor", "nota": "Validado en bascula"}}},
        "completedZones": ["0:devA", "0:devB"], "manuales": [],
        "zoneSnapshot": [{"nombre": "Camara fria", "items": [
            {"cod": "MP1", "art": "Producto compartido", "uni": "KG"}]}],
        "operariosByDevice": {"devA": {"operario": "Ana"}, "devB": {"operario": "Luis"}},
        "receipts": [], "exportedAt": "2026-08-01T07:00:00Z", "exportedBy": "Auditor"
    },
    "CAVA": {
        "ok": True, "found": True, "operario": "Omar", "fecha": "2026-07-31",
        "countsByZone": {"0:devO": {"CV1": 4}}, "presChoiceByZone": {},
        "correctionsByZone": {}, "completedZones": ["0:devO"], "manuales": [],
        "zoneSnapshot": [{"nombre": "Racks", "items": [
            {"cod": "CV1", "art": "Vino prueba", "uni": "PZA"}]}],
        "operariosByDevice": {"devO": {"operario": "Omar"}}, "receipts": [],
        "exportedAt": "", "exportedBy": ""
    },
    "GENERAL": {
        "ok": True, "found": True, "operario": "Pablo", "fecha": "2026-07-31",
        "countsByZone": {"0:devP": {"GN1": 9}}, "presChoiceByZone": {},
        "correctionsByZone": {}, "completedZones": [], "manuales": [],
        "zoneSnapshot": [{"nombre": "Anaqueles", "items": [
            {"cod": "GN1", "art": "Producto general", "uni": "PZA"}]}],
        "operariosByDevice": {"devP": {"operario": "Pablo"}}, "receipts": [],
        "exportedAt": "", "exportedBy": ""
    }
}

# Una toma larga, equivalente al volumen real de Barra Restaurante (163
# renglones), obliga al generador a paginar y protege contra el PDF blanco que
# provocaba rasterizar toda la tabla en un solo canvas.
for indice in range(2, 172):
    codigo = f"CV{indice:03d}"
    DETALLES["CAVA"]["countsByZone"]["0:devO"][codigo] = indice / 10
    DETALLES["CAVA"]["zoneSnapshot"][0]["items"].append(
        {"cod": codigo, "art": f"Vino prueba {indice:03d}", "uni": "PZA"})
SESIONES[1]["articulosContados"] = 171


class Stub:
    def __init__(self):
        self.detalles_pedidos = []

    def __call__(self, route):
        req = route.request
        parsed = urlparse(req.url)
        query = parse_qs(parsed.query)
        if parsed.path.endswith("/inv/plantilla") and req.method == "POST":
            body = json.loads(req.post_data or "{}")
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True})
            else:
                route.fulfill(json={"ok": True})
        elif parsed.path.endswith("/inv/sesiones"):
            route.fulfill(json={"ok": True, "sesiones": SESIONES, "minAppVersion": 2})
        elif parsed.path.endswith("/inv/sesion"):
            almacen = query.get("almacen", [""])[0]
            self.detalles_pedidos.append(almacen)
            route.fulfill(json=DETALLES.get(almacen, {"ok": True, "found": False}))
        elif parsed.path.endswith("/inv/plantilla"):
            almacen = query.get("almacen", [""])[0]
            unidades = {"COCINA": {"MP1": "KG"}, "CAVA": {"CV1": "PZA"},
                        "GENERAL": {"GN1": "PZA"}}
            route.fulfill(json={"ok": True, "found": True, "raw": None,
                                "unitMap": unidades.get(almacen, {}),
                                "presMap": {}, "defaultPres": {}})
        else:
            route.fulfill(json={"ok": True})


def check(cond, msg):
    if not cond:
        print(f"❌ {msg}")
        sys.exit(1)
    print(f"✓ {msg}")


server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                          cwd="/home/lilp/proyectos",
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        errores = []
        dialogos = []
        page.on("pageerror", lambda error: errores.append(str(error)))
        page.on("dialog", lambda dialog: (dialogos.append(dialog.message), dialog.dismiss()))
        stub = Stub()
        page.route(WORKER + "/**", stub)
        page.goto(BASE)
        page.fill("#nombre-input", "Auditor")
        page.fill("#pwd-input", "x")
        page.click(".btn-login")
        page.wait_for_selector("#pantalla-admin", state="visible")
        page.wait_for_function("typeof window.construirDatosPDFSesion === 'function'")

        boton = page.locator(".btn-pdf-general")
        check(boton.count() == 1, "hay un boton general para restaurante y fecha")
        texto = boton.inner_text()
        check("Piazza Pasticcio" in texto and "3 almacenes" in texto,
              "el boton integral anuncia todas las tomas aun sin XLSX")
        check("pendiente" not in texto.lower(),
              "el PDF integral ya no depende del estado de exportacion XLSX")

        # El generador solo debe usar un lienzo semilla diminuto. El reporte se
        # escribe como texto/vector para no rebasar el limite de canvas en movil.
        page.evaluate("""() => {
          window.__pdfCanvasAreas = [];
          const original = HTMLCanvasElement.prototype.toDataURL;
          HTMLCanvasElement.prototype.toDataURL = function(...args) {
            window.__pdfCanvasAreas.push(this.width * this.height);
            return original.apply(this, args);
          };
        }""")

        # Ejecuta html2pdf real antes de sustituir los generadores para inspeccionar
        # sus argumentos en las pruebas siguientes.
        tarjeta_cocina = page.locator(".toma-card").filter(has_text="COCINA")
        with page.expect_download(timeout=60000) as descarga_info:
            tarjeta_cocina.locator("button").filter(has_text="PDF").click()
        descarga = descarga_info.value
        check(bool(descarga), "html2pdf real genera y descarga el PDF administrativo")
        check(descarga.suggested_filename == "Toma_COCINA_2026-07-31.pdf",
              "la descarga real conserva el nombre del PDF administrativo")
        check(os.path.getsize(descarga.path()) > 3000,
              "el PDF individual contiene el reporte, no una pagina vacia")
        texto_individual = subprocess.check_output(
            ["pdftotext", str(descarga.path()), "-"], text=True)
        check("Producto compartido" in texto_individual and "Ana" in texto_individual,
              "el PDF individual contiene texto seleccionable y datos de la toma")

        tarjeta_cava = page.locator(".toma-card").filter(has_text="CAVA")
        with page.expect_download(timeout=60000) as descarga_cava_info:
            tarjeta_cava.locator("button").filter(has_text="PDF").click()
        descarga_cava = descarga_cava_info.value
        texto_cava = subprocess.check_output(
            ["pdftotext", str(descarga_cava.path()), "-"], text=True)
        info_cava = subprocess.check_output(
            ["pdfinfo", str(descarga_cava.path())], text=True)
        paginas_cava = int(next(line.split(":", 1)[1] for line in info_cava.splitlines()
                                if line.startswith("Pages:")))
        check("Vino prueba 171" in texto_cava and paginas_cava > 1,
              "una toma de 171 articulos se pagina completa y no sale blanca")
        with page.expect_download(timeout=60000) as descarga_general_info:
            boton.click()
        descarga_general = descarga_general_info.value
        check(descarga_general.suggested_filename == "Conteo_general_PIAZZA_2026-07-31.pdf",
              "html2pdf real descarga tambien el consolidado en un solo archivo")
        check(os.path.getsize(descarga_general.path()) > 4000,
              "el PDF integral contiene portada y almacenes")
        texto_general_pdf = subprocess.check_output(
            ["pdftotext", str(descarga_general.path()), "-"], text=True)
        check(all(nombre in texto_general_pdf for nombre in
                  ["Producto compartido", "Vino prueba 171", "Producto general"]),
              "el PDF integral contiene los tres almacenes, incluidos los que no tienen XLSX")
        areas_canvas = page.evaluate("window.__pdfCanvasAreas")
        check(not areas_canvas or max(areas_canvas) <= 100,
              f"el PDF no rasteriza la tabla completa en un lienzo gigante ({areas_canvas})")
        page.wait_for_function("!document.querySelector('.btn-pdf-general')?.disabled")

        page.evaluate("""() => {
          window.__generarGeneralReal = window.generarPDFAdminGeneral;
          window.__generarIndividualReal = window.generarPDFAdmin;
          window.__descargarPDFReal = window.descargarPDFAdmin;
          window.generarPDFAdminGeneral = (...args) => { window.__generalArgs = args; };
          window.generarPDFAdmin = (...args) => { window.__individualArgs = args; };
        }""")
        boton.click()
        page.wait_for_function("Array.isArray(window.__generalArgs)")
        general = page.evaluate("""() => {
          const [centro, fecha, secciones] = window.__generalArgs;
          const cocina = secciones.find(s => s.toma.almacen_nombre === 'COCINA');
          const item = cocina.items.find(i => i.codigo === 'MP1');
          return { centro, fecha, almacenes: secciones.map(s => s.toma.almacen_nombre), item };
        }""")
        check(general["centro"] == "PIAZZA" and general["fecha"] == "2026-07-31",
              "el consolidado conserva restaurante y fecha")
        check(sorted(general["almacenes"]) == ["CAVA", "COCINA", "GENERAL"],
              "el consolidado incluye todas las tomas aunque no tengan XLSX")
        check("GENERAL" in stub.detalles_pedidos and "CAVA" in stub.detalles_pedidos,
              "las tomas sin XLSX se consultan y se incorporan")
        check(general["item"]["cantidadContada"] == 5 and general["item"]["cantidadFinal"] == 6,
              "conteo original y correccion final permanecen separados")
        check(general["item"]["aportes"] == [
            {"operario": "Ana", "zona": "Camara fria", "cantidad": 2},
            {"operario": "Luis", "zona": "Camara fria", "cantidad": 3}],
              "un articulo conserva las aportaciones de las dos personas")

        page.evaluate("""async () => {
          const args = window.__generalArgs;
          window.descargarPDFAdmin = (...downloadArgs) => {
            window.__generalDownloadArgs = downloadArgs;
            return Promise.resolve();
          };
          await window.__generarGeneralReal(...args);
        }""")
        general_download = page.evaluate("window.__generalDownloadArgs")
        documento_general = general_download[1]
        check(general_download[0] == "Conteo_general_PIAZZA_2026-07-31.pdf",
              "el archivo general recibe un nombre enviable y estable")
        check(documento_general["tipo"] == "general" and
              len(documento_general["secciones"]) == 3,
              "el documento integral conserva las tres secciones paginables")
        cocina_doc = next(s for s in documento_general["secciones"]
                          if s["toma"]["almacen_nombre"] == "COCINA")
        check(cocina_doc["items"][0]["aportes"] == [
            {"operario": "Ana", "zona": "Camara fria", "cantidad": 2},
            {"operario": "Luis", "zona": "Camara fria", "cantidad": 3}],
              "el documento integral conserva ambas autorias y la zona")

        tarjeta_cocina.locator("button").filter(has_text="PDF").click()
        page.wait_for_function("Array.isArray(window.__individualArgs)")
        individual = page.evaluate("""() => {
          const [toma, items] = window.__individualArgs;
          return { toma, item: items.find(i => i.codigo === 'MP1') };
        }""")
        check(individual["toma"]["almacen_nombre"] == "COCINA",
              "el boton PDF de la tarjeta sigue generando solo su almacen")
        check(len(individual["item"]["aportes"]) == 2,
              "el PDF individual usa la misma autoria multiple")

        page.evaluate("""async () => {
          const args = window.__individualArgs;
          window.descargarPDFAdmin = (...downloadArgs) => {
            window.__individualDownloadArgs = downloadArgs;
            return Promise.resolve();
          };
          await window.__generarIndividualReal(...args);
        }""")
        documento_individual = page.evaluate("window.__individualDownloadArgs[1]")
        check(documento_individual["tipo"] == "individual" and
              documento_individual["seccion"]["corrs"][0]["nota"] == "Validado en bascula",
              "el PDF individual conserva autoria y correccion administrativa")

        check(not errores, "admin.html carga y ejecuta sin errores JavaScript")
        context.close()
        browser.close()
    print("\n✅ smoke PDF admin: autoria multiple + consolidado OK")
finally:
    server.terminate()
