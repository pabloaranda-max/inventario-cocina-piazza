#!/usr/bin/env python3
"""Smoke de checkpoints en el cliente (2026-08-16).

Verifica en Chromium que inventario.html emite un checkpoint cada CHECKPOINT_CADA
artículos, montado en el sync que ya iba a salir, y que el operario no se entera:
sin PDF, sin mensaje y sin tocar el flujo del cierre.

Uso: python3 tests/smoke-checkpoint.py
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PORT = 8907
BASE = f"http://localhost:{PORT}/inventario.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
ROOT = Path("/home/lilp/proyectos")
CADA = 10          # debe coincidir con CHECKPOINT_CADA en inventario.html
DEBOUNCE_MS = 3600  # scheduleSyncSesion espera 3000 ms

CODS = [f"A{i:02d}" for i in range(1, 26)]

PLANTILLA = {
    "ok": True, "found": True,
    "rowMap": {c: i + 10 for i, c in enumerate(CODS)},
    "cantidadColIdx": 7,
    "presMap": {}, "unitMap": {c: "KG" for c in CODS}, "defaultPres": {},
    "templateHash": "chk-template", "raw": None, "minAppVersion": 1,
}
ZONE_CONFIG = {
    "ok": True, "found": True, "id": "cfg-chk", "templateHash": "chk-template",
    "zones": [{
        "nombre": "Zona Checkpoint", "color": "#166534",
        "items": [{"cod": c, "orden": i, "activo": True} for i, c in enumerate(CODS)],
    }],
}
ARTICULOS = {"articulos": [
    {"codigo": c, "nombre": f"ARTICULO {c}", "unidad": "KG", "grupo": "G"} for c in CODS
]}

posts = []
descargas = []
n = 0


def ok(cond, msg):
    global n
    n += 1
    if not cond:
        print(f"❌ {msg}")
        raise SystemExit(1)
    print(f"✓ {msg}")


def acuse_de(body):
    zk = body["receiptZoneKey"]
    return {
        "schema": "inventory-zone-receipt/v1", "eventId": body["receiptEventId"],
        "almacen": body["almacen"], "fecha": body["fecha"], "operario": body["operario"],
        "deviceId": zk.split(":", 1)[1], "zoneKey": zk, "zoneIndex": 0,
        "zoneName": "Zona Checkpoint", "templateHash": body["templateHash"],
        "items": [], "manualItems": [],
        "id": f"ACU-TEST-{len(posts):06d}", "hash": "0" * 64,
        "receivedAt": "2026-08-16T00:00:00.000Z",
    }


def stub(route):
    req = route.request
    url = req.url
    if "/inv/plantilla" in url:
        route.fulfill(json=PLANTILLA)
    elif "/inv/zone-config" in url:
        route.fulfill(json=ZONE_CONFIG)
    elif "/inv/sesiones" in url:
        route.fulfill(json={"ok": True, "sesiones": [], "minAppVersion": 1})
    elif "/inv/lock" in url:
        route.fulfill(json={"ok": True})
    elif "/articulos" in url:
        route.fulfill(json=ARTICULOS)
    elif "/inv/sesion" in url:
        if req.method == "POST":
            body = json.loads(req.post_data or "{}")
            posts.append(body)
            recibo = acuse_de(body) if body.get("requestReceipt") else None
            route.fulfill(json={"ok": True, "receipt": recibo})
        else:
            route.fulfill(json={"ok": True, "found": False})
    else:
        route.fulfill(json={"ok": True})


def checkpoints():
    return [b for b in posts if b.get("receiptKind") == "checkpoint"]


def cierres():
    return [b for b in posts if b.get("requestReceipt") and not b.get("receiptKind")]


server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)], cwd=ROOT,
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(accept_downloads=True)
        page.on("dialog", lambda d: d.accept())
        page.on("download", lambda d: descargas.append(d.suggested_filename))
        page.route(WORKER + "/**", stub)
        page.goto(BASE)

        page.select_option("#area-select", "CAVA")
        page.click("text=Continuar →")
        page.wait_for_timeout(250)
        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "OPERARIO CHECKPOINT")
        page.fill("#inp-fecha", "2026-08-16")
        page.click("text=Iniciar →")
        page.wait_for_timeout(200)
        page.evaluate("startCount(0)")

        def contar(desde, hasta):
            for c in CODS[desde:hasta]:
                page.fill(f'#count-list input.qty-input[data-cod="{c}"]', "1")
            page.wait_for_timeout(DEBOUNCE_MS)

        # ── 1. Antes del umbral no pasa nada ───────────────────────────────
        contar(0, CADA - 1)
        ok(len(checkpoints()) == 0,
           f"con {CADA - 1} artículos todavía no hay checkpoint")
        ok(len(posts) > 0, "pero el sync normal sí salió")

        # ── 2. Al cruzar el umbral, checkpoint ─────────────────────────────
        contar(CADA - 1, CADA)
        chks = checkpoints()
        ok(len(chks) == 1, f"al llegar a {CADA} artículos sale 1 checkpoint")
        c1 = chks[0]
        zk = c1["receiptZoneKey"]
        ok(c1["receiptEventId"] == f"chk:{zk}",
           "el eventId es estable por zona (chk:<zoneKey>), no aleatorio")
        ok(c1["requestReceipt"] is True, "pide acuse")
        ok(c1["completedZones"] == [],
           "la zona NO está cerrada: es justo el caso que el checkpoint cubre")
        ok(len(c1["countsByZone"][zk]) == CADA,
           f"el checkpoint lleva los {CADA} artículos capturados")
        ok(descargas == [], "no se descargó ningún PDF")

        # ── 3. El operario no ve nada ──────────────────────────────────────
        msg = page.evaluate("() => (window._lastZoneClosedMsg || '')")
        ok(msg == "", f"no se muestra mensaje al operario (vio {msg!r})")
        ok(page.evaluate("() => (S.receipts || []).length") == 0,
           "el checkpoint no entra a S.receipts (no compite con el PDF del cierre)")

        # ── 4. No se repite hasta el siguiente umbral ──────────────────────
        contar(CADA, CADA * 2 - 1)
        ok(len(checkpoints()) == 1,
           f"con {CADA * 2 - 1} artículos sigue habiendo solo 1 checkpoint")

        contar(CADA * 2 - 1, CADA * 2)
        chks = checkpoints()
        ok(len(chks) == 2, f"al llegar a {CADA * 2} sale el segundo")
        ok(len(chks[1]["countsByZone"][zk]) == CADA * 2,
           "el segundo checkpoint lleva la captura acumulada, no el delta")

        # ── 5. El cierre sigue siendo el cierre ────────────────────────────
        antes = len(checkpoints())
        with page.expect_download(timeout=30000):
            page.click("button:has-text('Cerrar esta zona')")
        page.wait_for_timeout(500)

        cs = cierres()
        ok(len(cs) == 1, "cerrar la zona emite exactamente un acuse de cierre")
        ok("receiptKind" not in cs[0] or cs[0]["receiptKind"] is None,
           "el cierre NO viaja marcado como checkpoint")
        ok(cs[0]["completedZones"] == [zk], "el cierre sí manda la zona cerrada")
        ok(len(checkpoints()) == antes,
           "cerrar no dispara un checkpoint extra montado encima")
        ok(len(descargas) == 1, "el cierre sí descarga su PDF")

        browser.close()
finally:
    server.terminate()

print(f"\n✅ smoke-checkpoint.py: {n}/{n} asserts")
