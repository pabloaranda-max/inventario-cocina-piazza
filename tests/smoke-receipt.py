#!/usr/bin/env python3
"""Smoke R23 — acuse auditable y PDF automático en el dispositivo contador."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


PORT = 8900
BASE = f"http://localhost:{PORT}/inventario.html"
WORKER = "https://operaciones-api.pablo-aranda.workers.dev"
ROOT = Path("/home/lilp/proyectos")

PLANTILLA = {
    "ok": True,
    "found": True,
    "rowMap": {"A1": 10},
    "cantidadColIdx": 7,
    "presMap": {"A1": [{"nombre": "BOTELLA", "factor": 0.75}]},
    "unitMap": {"A1": "LT"},
    "defaultPres": {},
    "templateHash": "receipt-template",
    "raw": None,
    "minAppVersion": 1,
}
ZONE_CONFIG = {
    "ok": True,
    "found": True,
    "id": "cfg-receipt",
    "templateHash": "receipt-template",
    "zones": [{
        "nombre": "Zona Acuse",
        "color": "#166534",
        "items": [{"cod": "A1", "orden": 10, "activo": True}],
    }],
}
ARTICULOS = {
    "articulos": [{
        "codigo": "A1",
        "nombre": "VINO DE AUDITORIA",
        "unidad": "LT",
        "grupo": "VINOS",
    }]
}

post_bodies = []
receipt_number = 0
issued_receipts = []
receipt_gets = []
stub_state = {"omit_next_receipt": False}
passed = 0


def ok(condition, message):
    global passed
    if not condition:
        print(f"❌ {message}")
        sys.exit(1)
    passed += 1
    print(f"✓ {message}")


def receipt_for(body):
    global receipt_number
    receipt_number += 1
    zone_key = body["receiptZoneKey"]
    device_id = zone_key.split(":", 1)[1]
    entered = body["countsByZone"][zone_key]["A1"]
    suffix = f"{receipt_number:024X}"
    receipt = {
        "schema": "inventory-zone-receipt/v1",
        "eventId": body["receiptEventId"],
        "almacen": body["almacen"],
        "fecha": body["fecha"],
        "operario": body["operario"],
        "deviceId": device_id,
        "zoneKey": zone_key,
        "zoneIndex": 0,
        "zoneName": "Zona Acuse",
        "templateHash": body["templateHash"],
        "items": [{
            "code": "A1",
            "name": "VINO DE AUDITORIA",
            "unit": "LT",
            "mode": "simple",
            "entered": entered,
            "factor": 0.75,
            "presentation": "BOTELLA",
            "baseQuantity": entered * 0.75,
        }],
        "manualItems": [{
            "id": "manual-audit",
            "name": "BOTELLA SIN CODIGO",
            "quantity": 1,
            "unit": "PZA",
            "entered": None,
            "factor": None,
            "presentation": "",
            "photoAttached": True,
            "createdAt": "2026-07-31T03:10:00.000Z",
        }],
        "id": f"ACU-20260731-{suffix}",
        "hash": (f"{receipt_number:02x}" * 32)[:64],
        "receivedAt": f"2026-07-31T03:2{receipt_number}:00.000Z",
    }
    issued_receipts.append(receipt)
    return receipt


def receipt_summaries():
    return [{
        key: value for key, value in receipt.items()
        if key not in ("items", "manualItems")
    } | {
        "itemCount": len(receipt["items"]),
        "manualItemCount": len(receipt["manualItems"]),
    } for receipt in issued_receipts]


def stub(route):
    request = route.request
    url = request.url
    if "/inv/plantilla" in url:
        if request.method == "POST":
            body = json.loads(request.post_data or "{}")
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True})
            else:
                route.fulfill(json={"ok": True})
        else:
            route.fulfill(json=PLANTILLA)
    elif "/inv/zone-config" in url:
        route.fulfill(json=ZONE_CONFIG)
    elif "/inv/sesiones" in url:
        sessions = []
        if issued_receipts:
            sessions.append({
                "almacen": "CAVA",
                "fecha": "2026-07-31",
                "operario": "Ana Auditora",
                "updatedAt": "2026-07-31T03:22:00.000Z",
                "exportedAt": "",
                "exportedBy": "",
                "articulosContados": 1,
                "zonasCompletadas": 1,
                "correcciones": 1,
                "manuales": 1,
                "comentarios": 0,
                "operarios": ["Ana Auditora"],
            })
        route.fulfill(json={"ok": True, "sesiones": sessions, "minAppVersion": 1})
    elif "/inv/receipt" in url:
        receipt_id = url.split("id=", 1)[1] if "id=" in url else ""
        receipt_gets.append(receipt_id)
        found = next((item for item in issued_receipts if item["id"] == receipt_id), None)
        route.fulfill(json={"ok": True, "found": bool(found), "verified": bool(found), "receipt": found})
    elif "/inv/sesion" in url:
        if request.method == "POST":
            body = json.loads(request.post_data or "{}")
            post_bodies.append(body)
            if body.get("action") == "inv_admin_check":
                route.fulfill(json={"ok": True, "master": True})
            else:
                if body.get("requestReceipt") and stub_state["omit_next_receipt"]:
                    stub_state["omit_next_receipt"] = False
                    receipt = None
                else:
                    receipt = receipt_for(body) if body.get("requestReceipt") else None
                route.fulfill(json={"ok": True, "receipt": receipt})
        else:
            if not issued_receipts:
                route.fulfill(json={"ok": True, "found": False})
            else:
                last_body = next(body for body in reversed(post_bodies) if body.get("requestReceipt"))
                zone_key = last_body["receiptZoneKey"]
                route.fulfill(json={
                    "ok": True,
                    "found": True,
                    "operario": "Ana Auditora",
                    "fecha": "2026-07-31",
                    "templateHash": "receipt-template",
                    "countsByZone": last_body["countsByZone"],
                    "presChoiceByZone": last_body["presChoiceByZone"],
                    "correctionsByZone": {zone_key: {"A1": {"operario": "Ana Auditora"}}},
                    "completedZones": [zone_key],
                    "lockedZones": {},
                    "manuales": last_body["manuales"],
                    "exportedAt": "",
                    "exportedBy": "",
                    "zoneConfigId": "cfg-receipt",
                    "zoneSnapshot": ZONE_CONFIG["zones"],
                    "operariosByDevice": {zone_key.split(":", 1)[1]: {"operario": "Ana Auditora"}},
                    "receipts": receipt_summaries(),
                    "updatedAt": "2026-07-31T03:22:00.000Z",
                })
    elif "/inv/lock" in url:
        route.fulfill(json={"ok": True})
    elif "/articulos" in url:
        route.fulfill(json=ARTICULOS)
    else:
        route.fulfill(json={"ok": True})


server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)],
    cwd=ROOT,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
time.sleep(1)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(accept_downloads=True)
        page.on("dialog", lambda dialog: dialog.accept())
        page.route(WORKER + "/**", stub)
        page.goto(BASE)

        page.select_option("#area-select", "CAVA")
        page.click("text=Continuar →")
        page.wait_for_timeout(250)
        page.click("text=Iniciar nueva toma →")
        page.fill("#inp-operario", "Ana Auditora")
        page.fill("#inp-fecha", "2026-07-31")
        page.click("text=Iniciar →")
        page.wait_for_timeout(150)
        page.evaluate("startCount(0)")
        page.fill('#count-list input.qty-input[data-cod="A1"]', "2")
        page.evaluate("""
          S.manuales.push({
            id:'manual-audit', nombre:'BOTELLA SIN CODIGO', cantidad:1, uni:'PZA',
            zona:'Zona Acuse', deviceId:getDeviceId(), foto:'data:image/jpeg;base64,x',
            createdAt:'2026-07-31T03:10:00.000Z', updatedAt:'2026-07-31T03:10:00.000Z'
          });
          lsSet('s', S);
        """)
        page.evaluate("""
          window.__receiptRenderText = '';
          new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
              if (node.nodeType === 1 && node.textContent.includes('Acuse de recepción de conteo')) {
                window.__receiptRenderText = node.textContent;
              }
            }
          }).observe(document.body, {childList:true});
        """)

        with page.expect_download(timeout=30000) as download_info:
            page.click("button:has-text('Cerrar esta zona')")
        download = download_info.value
        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / download.suggested_filename
            download.save_as(pdf_path)
            if os.environ.get("R23_PDF_OUTPUT"):
                shutil.copyfile(pdf_path, os.environ["R23_PDF_OUTPUT"])
            ok(download.suggested_filename.startswith("Acuse_CAVA_2026-07-31_Zona-1_"),
               f"nombre del PDF identifica almacén, fecha y zona ({download.suggested_filename})")
            ok(pdf_path.read_bytes().startswith(b"%PDF-"), "la descarga automática es un PDF real")
            ok(pdf_path.stat().st_size > 50_000, f"el PDF contiene el reporte renderizado ({pdf_path.stat().st_size} bytes)")
            info = subprocess.run(
                ["pdfinfo", str(pdf_path)],
                capture_output=True,
                text=True,
                check=True,
            ).stdout
            ok("Pages:" in info, "el PDF es legible por un validador independiente")

        receipt_posts = [body for body in post_bodies if body.get("requestReceipt")]
        first_body = receipt_posts[0]
        zone_key = first_body["receiptZoneKey"]
        ok(first_body["countsByZone"][zone_key] == {"A1": 2}, "el acuse envía la rebanada exacta del dispositivo")
        ok(first_body["presChoiceByZone"][zone_key]["A1"] == 0.75,
           "el cierre congela el factor usado aunque fuera el default")
        ok(zone_key in first_body["completedZones"], "el servidor solo recibe solicitud de acuse para zona cerrada")
        ok(bool(first_body["receiptEventId"]), "el cierre lleva evento idempotente para tolerar reintentos")

        rendered = page.evaluate("window.__receiptRenderText")
        ok("CONFIRMADO POR EL SERVIDOR" in rendered, "el documento declara la confirmación del servidor")
        ok("Ana Auditora" in rendered and "VINO DE AUDITORIA" in rendered,
           "el PDF contiene operador y artículo catalogado")
        ok("BOTELLA SIN CODIGO" in rendered and "con foto" in rendered,
           "el PDF incluye no catalogados y existencia de foto")
        ok(issued_receipts[0]["id"] in rendered and issued_receipts[0]["hash"] in rendered,
           "el PDF imprime folio y huella SHA-256")
        ok(page.locator(".zone-card.done .zone-receipt-btn").inner_text() == "Descargar PDF",
           "la zona conserva descarga manual después del intento automático")
        ok(page.evaluate("S.receipts.length") == 1, "el acuse queda persistido en la sesión local")

        # Simular una recarga futura: /inv/sesion solo trae metadata; al tocar PDF
        # la app recupera el payload completo por folio.
        page.evaluate("""
          S.receipts = S.receipts.map(r => ({
            id:r.id, hash:r.hash, receivedAt:r.receivedAt, schema:r.schema,
            eventId:r.eventId, almacen:r.almacen, fecha:r.fecha, operario:r.operario,
            deviceId:r.deviceId, zoneKey:r.zoneKey, zoneIndex:r.zoneIndex,
            zoneName:r.zoneName, templateHash:r.templateHash,
            itemCount:r.items.length, manualItemCount:r.manualItems.length
          }));
          lsSet('s', S);
        """)
        with page.expect_download(timeout=30000) as second_download_info:
            page.click(".zone-card.done .zone-receipt-btn")
        ok(second_download_info.value.suggested_filename == download.suggested_filename,
           "el mismo acuse se puede volver a descargar")
        ok(receipt_gets == [issued_receipts[0]["id"]], "la descarga desde metadata recupera y verifica el payload por folio")

        # Reabrir, corregir y cerrar otra vez: el acuse anterior no se borra.
        page.click(".zone-card.done")
        page.fill('#count-list input.qty-input[data-cod="A1"]', "3")
        stub_state["omit_next_receipt"] = True
        page.click("button:has-text('Cerrar esta zona')")
        page.wait_for_timeout(150)
        ok(page.locator(".zone-card.done .zone-receipt-btn").inner_text() == "Confirmar y PDF",
           "un fallo del acuse nuevo no queda oculto detrás del PDF anterior")
        ok("Acuse anterior" in page.locator(".zone-card.done .zone-meta").inner_text(),
           "la tarjeta distingue el acuse anterior del cierre pendiente")
        with page.expect_download(timeout=30000):
            page.click(".zone-card.done .zone-receipt-btn")
        page.wait_for_timeout(150)
        ok(page.evaluate("S.receipts.length") == 2, "una corrección y nuevo cierre conserva ambos acuses")
        ok(issued_receipts[0]["id"] != issued_receipts[1]["id"], "el nuevo cierre recibe un folio distinto")
        ok(issued_receipts[1]["id"] in page.locator(".zone-card.done .zone-meta").inner_text(),
           "la tarjeta muestra el acuse más reciente")

        # Volumen realista: el acuse debe paginar, no truncar una zona grande.
        large_receipt = {
            **issued_receipts[1],
            "id": "ACU-20260731-" + "F" * 24,
            "hash": "f" * 64,
            "items": [{
                "code": f"ART-{index:04d}",
                "name": f"ARTICULO DE PRUEBA NUMERO {index:04d}",
                "unit": "PZA",
                "mode": "simple",
                "entered": index,
                "factor": 1,
                "presentation": "Unidad base / abierto",
                "baseQuantity": index,
            } for index in range(1, 181)],
            "manualItems": [],
        }
        with page.expect_download(timeout=30000) as large_download_info:
            page.evaluate("(receipt) => downloadReceiptPdf(receipt, false)", large_receipt)
        with tempfile.TemporaryDirectory() as large_temp:
            large_path = Path(large_temp) / large_download_info.value.suggested_filename
            large_download_info.value.save_as(large_path)
            large_info = subprocess.run(
                ["pdfinfo", str(large_path)],
                capture_output=True,
                text=True,
                check=True,
            ).stdout
            pages_match = next(
                (line for line in large_info.splitlines() if line.startswith("Pages:")),
                "Pages: 0",
            )
            pages = int(pages_match.split(":", 1)[1].strip())
            ok(pages >= 3, f"una zona de 180 artículos pagina el acuse completo ({pages} páginas)")
            ok(large_path.stat().st_size > 150_000, "el PDF multipágina contiene el reporte renderizado")

        admin = browser.new_page()
        admin.route(WORKER + "/**", stub)
        admin.goto(f"http://localhost:{PORT}/admin.html")
        admin.fill("#nombre-input", "Auditor")
        admin.fill("#pwd-input", "x")
        admin.click(".btn-login")
        admin.wait_for_selector(".btn-notas:has-text('Explorar')")
        admin.click(".btn-notas:has-text('Explorar')")
        admin.wait_for_selector("text=Acuses confirmados por el servidor")
        detail_text = admin.locator("#detalle-sesion-body").inner_text()
        ok(issued_receipts[0]["id"] in detail_text and issued_receipts[1]["id"] in detail_text,
           "admin conserva visibles el acuse original y el corregido")
        ok(admin.locator("#detalle-sesion-body a:has-text('Verificar en servidor')").count() == 2,
           "cada acuse del admin enlaza a su verificación por folio")
        ok("2" in admin.locator(".detalle-stat:has-text('Acuses auditables') .detalle-stat-num").inner_text(),
           "el resumen de auditoría cuenta ambos acuses")
        admin.close()

        browser.close()

    print(f"\n✅ smoke R23 receipt: {passed} asserts OK")
finally:
    server.terminate()
