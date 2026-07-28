#!/usr/bin/env python3
"""Smoke "Cerrar con plantilla fresca" end-to-end (2026-07-28) — Pablo reporta que
el flujo nunca le funcionó, así que esta prueba lo recorre COMPLETO en Chromium con
el Worker stubeado: botón → picker → validación de contados → confirm con cobertura
→ POST de plantilla → export real (mismatch de hash saltado por hashVerificado) →
marca de exportación → modal "Inventario listo" con el nombre exacto del archivo.
Verifica hasta las cantidades escritas en el xlsx final (factor 0.75 del fixture
incluido). Si esto pasa y en prod no, la falla está en los datos reales, el
navegador del teléfono o Xetux — no en la lógica del camino.

Además cubre el hueco encontrado al revisarla (2026-07-28): un export del MISMO
almacén pasaba la validación de contados (sus códigos coinciden todos) y se subía
como plantilla — el incidente 2026-07-27 por la otra puerta. Ahora la guarda R16
(senalesDeExport) frena en esta ruta igual que en la pestaña Plantillas."""
import base64, json, subprocess, sys, time
from playwright.sync_api import sync_playwright

PORT = 8898
BASE = f"http://localhost:{PORT}/admin.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
FIXTURE = "tests/fixtures/cava-synthetic.xlsx"

# Contados de la sesión: MP0001 tiene presentación BOTELLA 0.75 en el fixture
# (2 botellas → 1.5 LT en el xlsx); MP0007 no tiene presentación (factor 1).
SESION = {
    "ok": True, "found": True, "templateHash": "hash-viejo-de-la-toma",
    "countsByZone": {"0:dev1": {"MP0001": 2, "MP0007": 3}},
    "presChoiceByZone": {}, "correctionsByZone": {},
    "completedZones": ["0:dev1"], "zoneSnapshot": [{"id": "z1"}],
    "manuales": [], "operario": "Pablo",
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
        self.plantilla = None    # el POST inv_plantilla aceptado
        self.exports = []        # los POST inv_export aceptados

    def __call__(self, route):
        url, req = route.request.url, route.request
        if req.method == "POST":
            body = json.loads(req.post_data)
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True})
            elif body.get("action") == "inv_plantilla":
                self.plantilla = body
                route.fulfill(json={"ok": True})
            elif body.get("action") == "inv_export":
                self.exports.append(body)
                route.fulfill(json={"ok": True})
            else:
                route.fulfill(json={"ok": True})
        elif "/inv/sesiones" in url:
            route.fulfill(json={"ok": True, "minAppVersion": 1, "sesiones": [{
                "almacen": "CAVA", "fecha": "2026-07-27", "operario": "Pablo",
                "updatedAt": "2026-07-27T20:00:00Z"}]})
        elif "/inv/sesion" in url:
            route.fulfill(json=SESION)
        elif "/inv/plantilla" in url:
            # El export relee la plantilla del Worker: devolver la recién subida,
            # tal como haría D1 (raw incluido — de ahí sale el xlsx final).
            if self.plantilla:
                p = self.plantilla
                route.fulfill(json={"ok": True, "found": True, "minAppVersion": 1,
                                    "rowMap": p["rowMap"], "cantidadColIdx": p["cantidadColIdx"],
                                    "presMap": p["presMap"], "unitMap": p["unitMap"],
                                    "defaultPres": {}, "raw": p["raw"],
                                    "templateHash": p["templateHash"],
                                    "originalFilename": p["originalFilename"]})
            else:
                route.fulfill(json={"ok": True, "found": False})
        elif "/articulos" in url:
            route.fulfill(json={"ok": True, "articulos": []})
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
        page.on("dialog", lambda d: (dialogos.append((d.type, d.message)), d.accept()))
        page.route(WORKER + "/**", stub)
        page.goto(BASE)
        page.fill("#nombre-input", "Auditor")
        page.fill("#pwd-input", "x")
        page.click(".btn-login")
        page.wait_for_selector(".btn-pdf-card:has-text('plantilla fresca')")

        # ── A: un export del MISMO almacén se frena (antes se colaba: sus códigos
        # coinciden todos, así que la validación de contados no lo detectaba) ────
        export_b64 = page.evaluate("""async () => {
          const r = await fetch('tests/fixtures/cava-synthetic.xlsx');
          const buf = await r.arrayBuffer();
          const wb = XLSX.read(buf, { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
          for (let i = 1; i < rows.length; i++) {
            const cod = String(rows[i][4] || '');
            if (cod && !/_\\d+$/.test(cod))
              XLSX.utils.sheet_add_aoa(ws, [[2]], { origin: { r: i, c: 7 } });
          }
          return XLSX.write(wb, { type:'base64', bookType:'xlsx' });
        }""")
        with page.expect_file_chooser() as fc_info:
            page.click(".btn-pdf-card:has-text('plantilla fresca')")
        fc_info.value.set_files([{
            "name": "Inventario XTINV000279 20260727 CAVA.xlsx",
            "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "buffer": base64.b64decode(export_b64)}])
        page.wait_for_timeout(1000)
        ok(any(t == "alert" and "no es una plantilla de Xetux" in m and "SheetJS" in m
               for t, m in dialogos),
           "A: el export del mismo almacén se frena con las señales R16")
        ok(stub.plantilla is None and stub.exports == [],
           "A: nada se subió ni se exportó con el archivo equivocado")

        # ── B: con la plantilla legítima el par completo funciona ─────────────
        dialogos.clear()
        with page.expect_file_chooser() as fc_info:
            page.click(".btn-pdf-card:has-text('plantilla fresca')")
        fc_info.value.set_files(FIXTURE)
        page.wait_for_selector("#modal-archivo", state="visible", timeout=15000)

        ok(any(t == "confirm" and "cubre los 2 contados" in m and "Xetux los aplica como CERO" in m
               for t, m in dialogos),
           "el confirm del par plantilla+export sale con la cobertura")
        ok(not any(t == "alert" for t, m in dialogos),
           "sin un solo alert de error en todo el camino")
        ok(stub.plantilla and stub.plantilla["almacen"] == "CAVA"
           and stub.plantilla["originalFilename"] == "cava-synthetic.xlsx"
           and len(stub.plantilla["rowMap"]) == 8,
           "la plantilla fresca llegó al Worker con su nombre y 8 artículos")
        ok(len(stub.exports) == 1 and stub.exports[0]["force"] is True,
           "la sesión quedó marcada como exportada (inv_export con force)")
        ok(page.locator("#archivo-nombre").inner_text() == "cava-synthetic.xlsx",
           "el modal muestra el nombre EXACTO que Xetux va a exigir")

        # El xlsx final, celda por celda: 2 botellas × 0.75 = 1.5 LT y 3 piezas.
        celdas = page.evaluate("""() => {
          const wb = XLSX.read(_archivoXetux.bytes, { type:'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const v = (r, c) => ws[XLSX.utils.encode_cell({ r, c })]?.v;
          return { mp1: v(1, 7), mp7: v(14, 7) };
        }""")
        ok(celdas["mp1"] == 1.5, f"MP0001: 2 × factor 0.75 → 1.5 en el xlsx ({celdas['mp1']})")
        ok(celdas["mp7"] == 3, f"MP0007: sin presentación → 3 tal cual ({celdas['mp7']})")
        browser.close()
    print(f"\n✅ smoke plantilla fresca: {passed} asserts OK")
finally:
    srv.terminate()
