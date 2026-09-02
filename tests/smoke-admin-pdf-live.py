#!/usr/bin/env python3
"""Smoke manual de PDFs contra tomas reales (solo lectura).

Uso:
  python3 tests/smoke-admin-pdf-live.py [--output=archivo.pdf] [--reviewer=Nombre] FECHA ALMACEN...
"""
import subprocess
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


PORT = 8898
BASE = f"http://127.0.0.1:{PORT}/admin.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
ROOT = "/home/lilp/proyectos"


def check(cond, message):
    if not cond:
        raise AssertionError(message)
    print(f"✓ {message}")


def paginas_pdf(path):
    info = subprocess.check_output(["pdfinfo", str(path)], text=True)
    return int(next(line.split(":", 1)[1] for line in info.splitlines()
                    if line.startswith("Pages:")))


def texto_pdf(path):
    return subprocess.check_output(["pdftotext", str(path), "-"], text=True)


def main():
    args = sys.argv[1:]
    output = None
    reviewer = "Smoke PDF"
    while args and args[0].startswith("--"):
        option = args.pop(0)
        if option.startswith("--output="):
            output = option.split("=", 1)[1]
        elif option.startswith("--reviewer="):
            reviewer = option.split("=", 1)[1]
        else:
            raise SystemExit(f"Opción desconocida: {option}")
    if len(args) < 2:
        raise SystemExit("Uso: smoke-admin-pdf-live.py FECHA ALMACEN [ALMACEN ...]")
    fecha, *almacenes = args
    server = ThreadingHTTPServer(
        ("127.0.0.1", PORT), partial(SimpleHTTPRequestHandler, directory=ROOT))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(accept_downloads=True)
            page = context.new_page()
            errores = []
            page.on("pageerror", lambda error: errores.append(str(error)))

            def route_worker(route):
                request = route.request
                if (urlparse(request.url).path.endswith("/inv/plantilla")
                        and request.method == "POST"):
                    route.fulfill(json={"ok": True, "master": True})
                else:
                    route.continue_()

            page.route(WORKER + "/**", route_worker)
            page.goto(BASE)
            page.fill("#nombre-input", reviewer)
            page.fill("#pwd-input", "local")
            page.click(".btn-login")
            page.wait_for_selector("#pantalla-admin", state="visible")
            page.wait_for_function("document.querySelectorAll('.toma-card').length > 0")

            # ALIMENTARI es la toma real que quedó repartida entre Tienda (día 9)
            # y Almacén (día 10). La lista resumida sólo conoce 66 y 46 por
            # separado; el admin debe afinar la unión a 81 códigos únicos, no
            # mostrar 66+ ni sumar 112. El estado de exportación también debe
            # seguir siendo parcial mientras falte uno de los dos tramos.
            alimentari = page.locator(
                '.toma-card:has(.toma-almacen:text-is("ALIMENTARI"))')
            if alimentari.count() == 1:
                page.wait_for_function(
                    "document.querySelector('.toma-card:has(.toma-almacen)') !== null")
                page.wait_for_function(
                    "[...document.querySelectorAll('.toma-card')].some(c => "
                    "c.querySelector('.toma-almacen')?.textContent.trim() === 'ALIMENTARI' "
                    "&& c.textContent.includes('81 artículos'))")
                texto_tarjeta = alimentari.inner_text()
                check("81 artículos" in texto_tarjeta,
                      "ALIMENTARI muestra 81 códigos únicos en la tarjeta unida")
                check("1 de 2 tramos exportados" in texto_tarjeta,
                      "ALIMENTARI conserva el estado XLSX parcial")

            for almacen in almacenes:
                tarjeta = page.locator(
                    f'.toma-card:has(.toma-almacen:text-is("{almacen}"))')
                check(tarjeta.count() == 1, f"la toma real {almacen} esta visible")
                with page.expect_download(timeout=90000) as descarga_info:
                    tarjeta.locator("button").filter(has_text="PDF").click()
                descarga = descarga_info.value
                texto = texto_pdf(descarga.path())
                check(almacen in texto and len(texto.strip()) > 500,
                      f"{almacen}: PDF con contenido real y texto seleccionable")
                check(paginas_pdf(descarga.path()) >= 1,
                      f"{almacen}: PDF paginado valido")

            boton = page.locator(f'[data-pdf-general="PIAZZA|{fecha}"]')
            check(boton.count() == 1, "el boton integral existe antes de generar XLSX")
            with page.expect_download(timeout=120000) as integral_info:
                boton.click()
            integral = integral_info.value
            integral_texto = texto_pdf(integral.path())
            check(all(almacen in integral_texto for almacen in almacenes),
                  "el PDF integral incluye Cava y ambas barras")
            check("09/08/2026" in integral_texto and "10/08/2026" in integral_texto
                  and "Toma unida" in integral_texto,
                  "el integral explica y consolida la captura en dos fechas")
            check("XLSX parcial (1/2)" in integral_texto
                  and "XLSX parcial: 1 de 2 tramos" in integral_texto,
                  "el PDF conserva el estado XLSX parcial de ALIMENTARI")
            check("captura distribuida en 2 fechas" in integral_texto
                  and "el cambio de día la partió" not in integral_texto,
                  "la leyenda de la unión describe los datos reales")
            check("4 tomas todavía no tienen el XLSX completo" in integral_texto,
                  "la portada cuenta también la toma con exportación parcial")
            check(paginas_pdf(integral.path()) > len(almacenes),
                  "el PDF integral pagina el volumen real completo")
            if output:
                integral.save_as(output)
                print(f"✓ PDF integral guardado en {output}")
            check(not errores, "admin.html no produjo errores JavaScript")
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
