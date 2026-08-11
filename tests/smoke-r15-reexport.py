#!/usr/bin/env python3
"""Smoke cobertura R15 en Re-exportar (2026-07-28) — re-exportar aplicaría los
mismos CEROs que la primera vez, así que la confirmación con cobertura ya no se
salta con force. A) el botón Re-exportar muestra la cobertura (N de M, CEROs,
zonas sin cerrar) y cancelar no exporta nada. B) "Generar XLSX" sobre una sesión
ya exportada pasa por "¿Re-exportar de todos modos?" y DESPUÉS por la cobertura.
Solo "Cerrar con plantilla fresca" queda exenta: confirma con su propia línea."""
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright

PORT = 8897
BASE = f"http://localhost:{PORT}/admin.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"

ROWMAP = {f"MP000{i}": i for i in range(1, 9)}   # 8 artículos de plantilla
SESION = {
    "ok": True, "found": True, "templateHash": "stub-r15",
    "countsByZone": {"0:dev1": {"MP0001": 2}},   # 1 contado → 7 irían en CERO
    "presChoiceByZone": {}, "correctionsByZone": {}, "completedZones": [],
    "zoneSnapshot": [{"id": "z1"}, {"id": "z2"}],  # 2 zonas, ninguna cerrada
    "manuales": [], "exportedAt": "2026-07-21T10:00:00Z", "exportedBy": "Pablo",
}
PLANTILLA = {
    "ok": True, "found": True, "raw": "x", "rowMap": ROWMAP,
    "templateHash": "stub-r15", "presMap": {}, "unitMap": {}, "defaultPres": {},
    "originalFilename": "Inventario XTINV000269 CAVA.xlsx", "minAppVersion": 1,
}

passed = 0
def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}"); sys.exit(1)
    passed += 1
    print(f"✓ {msg}")

class Stub:
    def __init__(self):
        self.posts = []   # cualquier POST /inv/* = algo intentó escribir

    def __call__(self, route):
        url, req = route.request.url, route.request
        if req.method == "POST":
            body = json.loads(req.post_data)
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True}); return
            self.posts.append(body)
            route.fulfill(json={"ok": True})
        elif "/inv/sesiones" in url:
            route.fulfill(json={"ok": True, "minAppVersion": 1, "sesiones": [{
                "almacen": "CAVA", "fecha": "2026-07-20", "operario": "Pablo",
                "updatedAt": "2026-07-21T10:00:00Z",
                "exportedAt": SESION["exportedAt"], "exportedBy": "Pablo"}]})
        elif "/inv/sesion" in url:
            route.fulfill(json=SESION)
        elif "/inv/plantilla" in url:
            route.fulfill(json=PLANTILLA)
        else:
            route.fulfill(json={"ok": True, "found": False})

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd="/home/lilp/proyectos", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        stub = Stub()
        page = browser.new_page()
        dialogos = []
        plan = []   # respuestas planeadas por diálogo (True=aceptar); default: cancelar
        def on_dialog(d):
            dialogos.append((d.type, d.message))
            (d.accept() if (plan.pop(0) if plan else False) else d.dismiss())
        page.on("dialog", on_dialog)
        page.route(WORKER + "/**", stub)
        page.goto(BASE)
        page.fill("#nombre-input", "Auditor")
        page.fill("#pwd-input", "x")
        page.click(".btn-login")
        page.wait_for_selector(".btn-pdf-card:has-text('Re-exportar')")

        # ── A: Re-exportar muestra la cobertura; cancelar no exporta ──────────
        # El botón abre el modal de plantilla; la salida "guardada" es el export
        # de siempre. Como la tarjeta ya dice "Re-exportar", no vuelve a
        # preguntar si re-exportar: va directo a la cobertura.
        page.click(".btn-pdf-card:has-text('Re-exportar')")
        page.wait_for_selector("#modal-plantilla-export", state="visible")
        page.click("[onclick=\"plxElegir('guardada')\"]")
        page.wait_for_timeout(600)
        confirms = [m for t, m in dialogos if t == "confirm"]
        ok(len(confirms) == 1 and confirms[0].startswith("Re-exportar la toma"),
           "A: el botón Re-exportar ya pasa por la confirmación de cobertura")
        ok("Se escriben 1 de los 8" in confirms[0], "A: dice la cobertura real (1 de 8)")
        ok("Xetux los aplica como CERO" in confirms[0], "A: advierte los 7 que van en CERO")
        ok("2 zona(s) sin cerrar" in confirms[0], "A: avisa de las zonas sin cerrar")
        ok("ya se había exportado" in confirms[0], "A: aclara que es una re-exportación")
        ok(stub.posts == [], "A: cancelar no escribió nada en el Worker")
        ok(not any(t == "alert" for t, _ in dialogos), "A: sin errores en pantalla")

        # ── B: tarjeta obsoleta (otro admin exportó mientras estaba en pantalla)
        # → el export entra con force=false y la guarda sigue preguntando antes
        # de pisar, sin saltarse la cobertura ──────────────────────────────────
        dialogos.clear()
        plan.append(True)    # aceptar "¿Re-exportar de todos modos?"; cancelar la cobertura
        page.evaluate("exportarSesionInventario('CAVA','2026-07-27', false)")
        page.wait_for_timeout(600)
        confirms = [m for t, m in dialogos if t == "confirm"]
        ok(len(confirms) == 2 and "Re-exportar de todos modos" in confirms[0],
           "B: primero pregunta si re-exportar una toma ya exportada")
        ok(confirms[1].startswith("Re-exportar la toma") and "Se escriben 1 de los 8" in confirms[1],
           "B: y la cobertura ya no se salta aunque force quedó en true")
        ok(stub.posts == [], "B: cancelar la cobertura no escribió nada en el Worker")

        # ── C: la tarjeta quedó con los 4 botones acordados ───────────────────
        etiquetas = [t.strip() for t in page.eval_on_selector_all(
            ".toma-card button", "els => els.map(e => e.textContent.trim())")]
        ok(len(etiquetas) == 4, f"C: la tarjeta tiene exactamente 4 botones ({etiquetas})")
        ok(any("Explorar" in e for e in etiquetas) and any("PDF" in e for e in etiquetas)
           and any("Re-exportar" in e for e in etiquetas) and any("Borrar" in e for e in etiquetas),
           "C: son Explorar, PDF, Re-exportar y Borrar")
        browser.close()
    print(f"\n✅ smoke R15 re-export: {passed} asserts OK")
finally:
    srv.terminate()
