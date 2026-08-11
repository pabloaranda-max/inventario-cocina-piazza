#!/usr/bin/env python3
"""Smoke — la pestaña vieja del admin se entera tras un deploy.

El banner R12 solo salta cuando el Worker sube `minAppVersion`, es decir ante un
cambio de FORMATO. Un cambio de interfaz no toca el protocolo, así que una
pestaña abierta seguía corriendo la versión vieja en silencio. Esto compara el
sello `<meta name="build">` del documento contra el del servidor.

Verifica que avise cuando el sello cambia, que calle cuando es el mismo, que no
grite si el servidor no responde, y que el aviso de protocolo (que sí puede
corromper datos) mande sobre el de interfaz.
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PORT = 8902
BASE = f"http://localhost:{PORT}/admin.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
ROOT = Path("/home/lilp/proyectos")

passed = 0


def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}")
        sys.exit(1)
    passed += 1
    print(f"✓ {msg}")


def worker_stub(min_app_version=2):
    def handler(route):
        url, req = route.request.url, route.request
        if req.method == "POST":
            body = json.loads(req.post_data or "{}")
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True})
            else:
                route.fulfill(json={"ok": True})
        elif "/inv/sesiones" in url:
            route.fulfill(json={"ok": True, "sesiones": [],
                                "minAppVersion": min_app_version})
        else:
            route.fulfill(json={"ok": True, "found": False})
    return handler


def entrar(page):
    page.fill("#nombre-input", "Auditor")
    page.fill("#pwd-input", "x")
    page.click(".btn-login")


server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1)

sello_real = re.search(r'name="build" content="([^"]+)"',
                       (ROOT / "admin.html").read_text()).group(1)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── A: el servidor tiene otro sello → avisa ───────────────────────────
        page = browser.new_page()
        errores = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.route(WORKER + "/**", worker_stub())

        def sello_distinto(route):
            if route.request.method == "GET" and "v=" in route.request.url:
                route.fulfill(status=200, content_type="text/html",
                              body='<meta name="build" content="OTRO-SELLO">')
            else:
                route.continue_()

        page.route("**/admin.html*", sello_distinto)
        page.goto(BASE)
        entrar(page)
        page.wait_for_selector("#update-banner", timeout=10000)
        banner = page.locator("#update-banner").inner_text()
        ok("versión nueva del admin" in banner,
           "A: avisa cuando el servidor trae otro sello")
        ok("Actualizar" in banner, "A: el aviso trae el botón que fuerza la recarga")
        ok(page.evaluate("document.querySelector('#update-banner').dataset.critico") == "0",
           "A: el aviso de interfaz no se marca como crítico")
        ok(not errores, f"A: sin errores JavaScript ({errores})")
        page.close()

        # ── B: mismo sello → silencio ─────────────────────────────────────────
        page = browser.new_page()
        page.route(WORKER + "/**", worker_stub())

        def sello_igual(route):
            if route.request.method == "GET" and "v=" in route.request.url:
                route.fulfill(status=200, content_type="text/html",
                              body=f'<meta name="build" content="{sello_real}">')
            else:
                route.continue_()

        page.route("**/admin.html*", sello_igual)
        page.goto(BASE)
        entrar(page)
        page.wait_for_timeout(1500)
        ok(page.locator("#update-banner").count() == 0,
           "B: con el mismo sello no molesta con avisos")
        page.close()

        # ── C: servidor mudo → no concluye nada ───────────────────────────────
        page = browser.new_page()
        page.route(WORKER + "/**", worker_stub())

        def sello_roto(route):
            if route.request.method == "GET" and "v=" in route.request.url:
                route.fulfill(status=500, body="")
            else:
                route.continue_()

        page.route("**/admin.html*", sello_roto)
        page.goto(BASE)
        entrar(page)
        page.wait_for_timeout(1500)
        ok(page.locator("#update-banner").count() == 0,
           "C: si no puede comprobar, no acusa de desactualizado")
        page.close()

        # ── D: el aviso de PROTOCOLO manda sobre el de interfaz ───────────────
        # Exportar con el formato viejo corrompe datos; una interfaz vieja solo
        # desconcierta. El mensaje grave no puede quedar tapado por el leve.
        page = browser.new_page()
        page.route(WORKER + "/**", worker_stub(min_app_version=99))
        page.route("**/admin.html*", sello_distinto)
        page.goto(BASE)
        entrar(page)
        page.wait_for_selector("#update-banner", timeout=10000)
        page.wait_for_timeout(1200)
        banner = page.locator("#update-banner").inner_text()
        ok("otro formato de datos" in banner,
           "D: con las dos condiciones gana el aviso de formato")
        ok(page.evaluate("document.querySelector('#update-banner').dataset.critico") == "1",
           "D: y queda marcado como crítico")
        ok(page.locator("#update-banner").count() == 1,
           "D: un solo banner, no dos superpuestos")
        page.close()

        browser.close()

    print(f"\n✅ smoke versión de interfaz: {passed} asserts OK")
finally:
    server.terminate()
