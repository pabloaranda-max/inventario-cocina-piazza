#!/usr/bin/env python3
"""Smoke R16 en navegador (2026-07-28) — el camino VISUAL de las guardas del admin,
que el commit 469e7a7 dejó validado solo en node. A) un export de la app se bloquea:
sale el alert con las dos señales (SheetJS + cantidades) y el input queda limpio.
B) una plantilla legítima con cruce alto sube sin fricción. C) el confirm de almacén
cruzado se puede cancelar (no sube nada) y también aceptar (decide la persona).
D) borrar una sesión fantasma refresca la lista y distingue "ya no existe" de una
falla real. El export de A se genera con el MISMO SheetJS del CDN que usa la app,
así la señal Application viene del escritor real, no de un fixture a mano."""
import base64, json, subprocess, sys, time
from playwright.sync_api import sync_playwright

PORT = 8896
BASE = f"http://localhost:{PORT}/admin.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
FIXTURE = "tests/fixtures/cava-synthetic.xlsx"

# El fixture trae 8 artículos MP0001–MP0008 (formato Xetux real, Application
# "Microsoft Excel", columna Cantidad vacía): pasa la guarda 1 legítimamente.
PREVIOS = {
    "CAVA":      {"MP0001": 1, "MP0002": 3, "MP0003": 5},              # cruce 3/3 → sube sin aviso
    "SALUMERIA": {"SL0001": 1, "SL0002": 2, "SL0003": 3, "SL0004": 4}, # cruce 0/4 → confirm
}

passed = 0
def ok(cond, msg):
    global passed
    if not cond:
        print(f"❌ {msg}"); sys.exit(1)
    passed += 1
    print(f"✓ {msg}")

class Stub:
    """Worker simulado. Registra qué plantillas se subieron y cuántas veces se
    pidió la lista de sesiones (para comprobar el refresh tras un borrado fallido)."""
    def __init__(self):
        self.subidas = []        # payloads de action inv_plantilla aceptados
        self.gets_sesiones = 0
        self.sesiones = []
        self.borrar_resp = {"ok": True}

    def __call__(self, route):
        url, req = route.request.url, route.request
        if "/inv/plantilla" in url and req.method == "POST":
            body = json.loads(req.post_data)
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True})
            elif body.get("action") == "inv_plantilla":
                self.subidas.append(body)
                route.fulfill(json={"ok": True})
            else:
                route.fulfill(json={"ok": True})
        elif "/inv/plantilla" in url:
            almacen = url.split("almacen=")[1].split("&")[0]
            rm = PREVIOS.get(almacen)
            if rm:
                route.fulfill(json={"ok": True, "found": True, "rowMap": rm,
                                    "presMap": {}, "defaultPres": {}, "raw": None,
                                    "originalFilename": f"Inventario XTINV000200 {almacen}.xlsx",
                                    "templateHash": "stub-r16", "updatedAt": "2026-07-26T10:00:00Z",
                                    "minAppVersion": 1})
            else:
                route.fulfill(json={"ok": True, "found": False})
        elif "/inv/sesiones" in url:
            self.gets_sesiones += 1
            route.fulfill(json={"ok": True, "sesiones": self.sesiones, "minAppVersion": 1})
        elif "/inv/sesion" in url and req.method == "POST":
            body = json.loads(req.post_data)
            if body.get("action") == "inv_delete":
                route.fulfill(json=self.borrar_resp)
            else:
                route.fulfill(json={"ok": True})
        else:
            route.fulfill(json={"ok": True, "found": False})

def entrar(page, stub):
    page.route(WORKER + "/**", stub)
    page.goto(BASE)
    page.fill("#nombre-input", "Auditor")
    page.fill("#pwd-input", "x")
    page.click(".btn-login")
    page.wait_for_selector("#pantalla-admin", state="visible")
    page.wait_for_timeout(300)

# Construye en la página un export como el real: el archivo de Xetux reescrito
# por SheetJS con las cantidades ya puestas en la columna que detecta el parser.
GENERAR_EXPORT = """async () => {
  const r = await fetch('tests/fixtures/cava-synthetic.xlsx');
  const buf = await r.arrayBuffer();
  const wb = XLSX.read(buf, { type:'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
  for (let i = 1; i < rows.length; i++) {
    const cod = String(rows[i][4] || '');
    if (cod && !/_\\d+$/.test(cod))
      XLSX.utils.sheet_add_aoa(ws, [[3]], { origin: { r: i, c: 7 } });
  }
  return XLSX.write(wb, { type:'base64', bookType:'xlsx' });
}"""

srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                       cwd="/home/lilp/proyectos", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── A + B + C: guardas de subida de plantilla ─────────────────────────
        stub = Stub()
        page = browser.new_page()
        dialogos = []
        modo = {"aceptar_confirm": True}
        def on_dialog(d):
            dialogos.append((d.type, d.message))
            if d.type == "confirm" and not modo["aceptar_confirm"]: d.dismiss()
            else: d.accept()
        page.on("dialog", on_dialog)
        entrar(page, stub)
        page.click(".tab:has-text('Plantillas')")
        page.select_option("#plt-almacen", "CAVA")
        page.wait_for_selector("#plt-upload", state="visible")

        # A: el export de la app se bloquea con el alert y el input queda limpio
        export_b64 = page.evaluate(GENERAR_EXPORT)
        page.set_input_files("#plt-file", files=[{
            "name": "Inventario XTINV000271 20260726 CAVA.xlsx",
            "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "buffer": base64.b64decode(export_b64)}])
        page.wait_for_timeout(1000)
        alertas = [m for t, m in dialogos if t == "alert" and "no es una plantilla" in m]
        ok(len(alertas) == 1, "A: el alert de 'eso es un export' sale en el navegador")
        ok("SheetJS" in alertas[0], "A: el alert acusa la señal 1 — lo escribió la app (SheetJS)")
        ok("cantidad capturada" in alertas[0], "A: el alert acusa la señal 2 — filas con cantidad")
        ok("export" in page.locator("#plt-msg").inner_text(), "A: el mensaje rojo queda en pantalla")
        ok(page.evaluate("document.getElementById('plt-file').value") == "",
           "A: el input queda limpio (reelegir el mismo archivo vuelve a disparar la guarda)")
        ok(stub.subidas == [], "A: al Worker no llegó ninguna plantilla")

        # B: la plantilla legítima del almacén correcto sube sin fricción
        dialogos.clear()
        page.set_input_files("#plt-file", FIXTURE)
        page.wait_for_timeout(1200)
        ok(not any(t == "confirm" for t, _ in dialogos),
           "B: cruce alto de códigos → sin confirm de por medio")
        ok(len(stub.subidas) == 1 and stub.subidas[0]["almacen"] == "CAVA"
           and "MP0001" in stub.subidas[0]["rowMap"],
           "B: la plantilla legítima sí llegó al Worker")
        ok("guardada correctamente" in page.locator("#plt-msg").inner_text(),
           "B: confirmación verde en pantalla")

        # C: plantilla de OTRO almacén → confirm; cancelar no sube nada
        dialogos.clear()
        modo["aceptar_confirm"] = False
        page.select_option("#plt-almacen", "SALUMERIA")
        page.wait_for_selector(".plt-status-card")
        page.set_input_files("#plt-file", FIXTURE)
        page.wait_for_timeout(1000)
        confirms = [m for t, m in dialogos if t == "confirm"]
        ok(len(confirms) == 1 and "solo 0 de los 4" in confirms[0]
           and "Subirla reemplaza la actual" in confirms[0],
           "C: el confirm de almacén cruzado sale y dice el cruce real (0 de 4)")
        ok("Cancelado" in page.locator("#plt-msg").inner_text(),
           "C: cancelar deja el aviso 'Cancelado, no se subió nada'")
        ok(page.evaluate("document.getElementById('plt-file').value") == "",
           "C: el input queda limpio tras cancelar")
        ok(len(stub.subidas) == 1, "C: nada nuevo llegó al Worker")
        # ...y aceptar sí sube: el aviso informa, la persona decide (criterio R6)
        modo["aceptar_confirm"] = True
        page.set_input_files("#plt-file", FIXTURE)
        page.wait_for_timeout(1200)
        ok(len(stub.subidas) == 2 and stub.subidas[1]["almacen"] == "SALUMERIA",
           "C: aceptar el confirm sí sube — el aviso no bloquea, informa")
        page.close()

        # ── D: borrar sesión — refresca también en el error ───────────────────
        stub = Stub()
        stub.sesiones = [{"almacen": "CAVA", "fecha": "2026-07-26",
                          "operario": "Fantasma", "updatedAt": "2026-07-26T12:00:00Z"}]
        page = browser.new_page()
        dialogos = []
        page.on("dialog", lambda d: (dialogos.append((d.type, d.message)), d.accept()))
        entrar(page, stub)
        page.wait_for_selector(".btn-borrar")

        # una falla real se reporta como error, y aun así la lista se refresca
        stub.borrar_resp = {"ok": False, "error": "D1 no responde"}
        antes = stub.gets_sesiones
        page.click(".btn-borrar")
        page.wait_for_timeout(800)
        ok(any(t == "alert" and m == "Error al borrar: D1 no responde" for t, m in dialogos),
           "D: una falla real se reporta como error, sin disfrazarla")
        ok(stub.gets_sesiones > antes, "D: la lista se refresca también cuando borrar falla")

        # la sesión fantasma: "no encontrada" → mensaje amable y la tarjeta se va
        dialogos.clear()
        stub.borrar_resp = {"ok": False, "error": "Sesión no encontrada"}
        stub.sesiones = []
        page.click(".btn-borrar")
        page.wait_for_timeout(800)
        ok(any(t == "alert" and "ya no existe en el servidor" in m for t, m in dialogos),
           "D: 'Sesión no encontrada' se traduce a 'esa toma ya no existe'")
        ok("Sin tomas" in page.locator("#sesiones-container").inner_text(),
           "D: la tarjeta fantasma desapareció de la pantalla")
        browser.close()
    print(f"\n✅ smoke R16 UI: {passed} asserts OK")
finally:
    srv.terminate()
