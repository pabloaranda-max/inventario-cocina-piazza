#!/usr/bin/env python3
"""Smoke reintento de sync (2026-07-24) — un POST fallido ya no se descarta en
silencio. A) fallo transitorio → reintenta y entra, sin banner. B) fallo sostenido
→ banner rojo y nada perdido en local. C) volver la conexión reenvía TODAS las
rebanadas de este dispositivo, incluida la zona ya cerrada (que el sync normal no
manda). D) un reintento viejo no pisa el estado nuevo. E) flujo normal intacto."""
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright

PORT = 8894
BASE = f"http://localhost:{PORT}/inventario.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"

PLANTILLA = {
    "ok": True, "found": True,
    "rowMap": {"V1": 10, "V2": 11, "V3": 12}, "cantidadColIdx": 7,
    "presMap": {"V1": [{"nombre": "BOTELLA", "factor": 0.75}]},
    "unitMap": {"V1": "LT", "V2": "LT", "V3": "LT"}, "defaultPres": {},
    "templateHash": "smokeretry", "raw": None, "minAppVersion": 1,
}
ARTICULOS = {"articulos": [
    {"codigo": "V1", "nombre": "VINO UNO", "unidad": "LT", "grupo": "VINOS"},
    {"codigo": "V2", "nombre": "VINO DOS", "unidad": "LT", "grupo": "VINOS"},
    {"codigo": "V3", "nombre": "VINO TRES", "unidad": "LT", "grupo": "VINOS"},
]}

passed = 0
def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}"); sys.exit(1)
    passed += 1
    print(f"✓ {msg}")

class Stub:
    """Worker simulado: `fallar` controla si los POST /inv/sesion revientan."""
    def __init__(self):
        self.fallar = False
        self.posts = []          # payloads que SÍ se aceptaron
        self.intentos = 0        # POST recibidos, incluidos los rechazados

    def __call__(self, route):
        url, req = route.request.url, route.request
        if req.method == "POST" and "/inv/sesion" in url:
            self.intentos += 1
            if self.fallar:
                route.fulfill(status=503, json={"ok": False, "error": "caído"})
            else:
                self.posts.append(json.loads(req.post_data))
                route.fulfill(json={"ok": True})
        elif "/inv/plantilla" in url:
            route.fulfill(json=PLANTILLA)
        elif "/inv/zone-config" in url:
            route.fulfill(json={"ok": True, "found": False})
        elif "/inv/sesiones" in url:
            route.fulfill(json={"ok": True, "sesiones": [], "minAppVersion": 1})
        elif "/articulos" in url:
            route.fulfill(json=ARTICULOS)
        else:
            route.fulfill(json={"ok": True, "found": False})

def arrancar(page, stub, operario):
    page.route(WORKER + "/**", stub)
    page.goto(BASE)
    page.select_option("#area-select", "CAVA")
    page.click("text=Continuar →")
    page.wait_for_timeout(400)
    page.click("text=Iniciar nueva toma →")
    page.fill("#inp-operario", operario)
    page.click("text=Iniciar →")
    page.wait_for_timeout(300)

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd="/home/lilp/proyectos", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── A: fallo transitorio → el reintento lo salva, sin banner ──────────
        stub = Stub()
        page = browser.new_page(); page.on("dialog", lambda d: d.accept())
        arrancar(page, stub, "Retry A")
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        stub.fallar = True
        page.fill('input.qty-input[data-cod="V1"]:not(.desg-input)', "7")
        page.wait_for_timeout(3600)            # debounce 3s + primer POST (falla)
        antes = len(stub.posts)
        stub.fallar = False                    # vuelve el servidor
        page.wait_for_timeout(3000)            # backoff 1s/2s → entra
        ok(len(stub.posts) > antes, f"A: el sync fallido se reintenta y entra (aceptados {antes}→{len(stub.posts)})")
        ok(page.locator("#sync-banner").count() == 0, "A: sin banner tras recuperarse solo")
        cbz = stub.posts[-1]["countsByZone"]
        ok(list(cbz.values())[0].get("V1") == 7, "A: el reintento lleva la cantidad capturada")
        page.close()

        # ── B: fallo sostenido → banner rojo, nada perdido en local ───────────
        stub = Stub()
        page = browser.new_page(); page.on("dialog", lambda d: d.accept())
        arrancar(page, stub, "Retry B")
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        stub.fallar = True
        page.fill('input.qty-input[data-cod="V1"]:not(.desg-input)', "5")
        # debounce 3s + 5 reintentos (1+2+4+8+16s) → esperar a que se agote
        page.wait_for_timeout(37000)
        ok(page.locator("#sync-banner").count() == 1, f"B: banner tras agotar reintentos ({stub.intentos} POST)")
        ok(stub.intentos >= 5, f"B: hubo reintentos reales, no un solo POST ({stub.intentos})")
        ok(page.evaluate("Object.values(S.countsByZone)[0]['V1']") == 5,
           "B: la captura sigue íntegra en localStorage")
        # el botón Reintentar del banner funciona una vez que vuelve el servidor
        stub.fallar = False
        page.click("#sync-banner button")
        page.wait_for_timeout(800)
        ok(page.locator("#sync-banner").count() == 0, "B: 'Reintentar' del banner sincroniza y quita el aviso")
        page.close()

        # ── C: recuperar conexión reenvía TAMBIÉN la zona ya cerrada ──────────
        stub = Stub()
        page = browser.new_page(); page.on("dialog", lambda d: d.accept())
        arrancar(page, stub, "Retry C")
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        page.fill('input.qty-input[data-cod="V1"]:not(.desg-input)', "4")
        page.wait_for_timeout(3500)
        page.evaluate("doneZone()")             # zona 0 cerrada → CZ = null
        page.wait_for_timeout(600)
        # a partir de aquí el sync normal ya NO manda countsByZone de la zona 0
        page.evaluate("syncSesionWorker()")
        page.wait_for_timeout(500)
        ultimo = stub.posts[-1]["countsByZone"]
        ok(ultimo == {}, "C: confirmado — tras cerrar zona el sync normal no manda conteos")
        n_antes = len(stub.posts)
        page.evaluate("window.dispatchEvent(new Event('online'))")
        page.wait_for_timeout(800)
        reenvio = stub.posts[-1]["countsByZone"]
        clave0 = [k for k in reenvio if k.startswith("0:")]
        ok(len(stub.posts) > n_antes and clave0 and reenvio[clave0[0]].get("V1") == 4,
           f"C: al volver la conexión se reenvía la zona cerrada ({reenvio})")
        page.close()

        # ── D: un reintento viejo no pisa el estado nuevo ─────────────────────
        stub = Stub()
        page = browser.new_page(); page.on("dialog", lambda d: d.accept())
        arrancar(page, stub, "Retry D")
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        stub.fallar = True
        page.fill('input.qty-input[data-cod="V1"]:not(.desg-input)', "1")
        page.wait_for_timeout(3400)             # sale el POST viejo (V1=1) y falla
        stub.fallar = False
        page.fill('input.qty-input[data-cod="V2"]:not(.desg-input)', "9")
        page.wait_for_timeout(9000)             # sale el POST nuevo (V1=1,V2=9); el viejo se abandona
        conteos = [list(pp["countsByZone"].values())[0]
                   for pp in stub.posts
                   if pp.get("action") == "inv_sesion" and pp.get("countsByZone")]
        ok(conteos[-1].get("V1") == 1 and conteos[-1].get("V2") == 9,
           f"D: el último POST aceptado tiene el estado completo y nuevo ({conteos[-1]})")
        # el payload viejo (V1 solo) fue abandonado: nunca se aceptó después del nuevo
        idx_nuevo = next(i for i, c in enumerate(conteos) if c.get("V2") == 9)
        ok(all("V2" in c for c in conteos[idx_nuevo:]),
           f"D: ningún reintento viejo se aceptó después del estado nuevo ({conteos})")
        ok(page.evaluate("Object.values(S.countsByZone)[0]['V2']") == 9, "D: estado local correcto")
        page.close()

        # ── E: flujo normal intacto ───────────────────────────────────────────
        stub = Stub()
        page = browser.new_page(); page.on("dialog", lambda d: d.accept())
        arrancar(page, stub, "Retry E")
        ok(page.locator("#sync-banner").count() == 0, "E: sin banner en el camino feliz")
        page.evaluate("startCount(0)")
        page.wait_for_timeout(200)
        page.fill('input.qty-input[data-cod="V1"]:not(.desg-input)', "2")
        page.wait_for_timeout(3600)
        ok(len(stub.posts) >= 2, f"E: los syncs normales entran ({len(stub.posts)} aceptados)")
        ok(stub.intentos == len(stub.posts), "E: ningún reintento extra cuando todo va bien")
        browser.close()
    print(f"\n✅ smoke sync-retry: {passed} asserts OK")
finally:
    srv.terminate()
