#!/usr/bin/env python3
"""Smoke R23 Worker+D1 real — persistencia, idempotencia y verificación de acuses."""
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path("/home/lilp/proyectos")
WORKER_DIR = ROOT / "worker/operaciones-api"
PORT = 8799
BASE = f"http://127.0.0.1:{PORT}"
passed = 0


def ok(condition, message):
    global passed
    if not condition:
        print(f"❌ {message}")
        sys.exit(1)
    passed += 1
    print(f"✓ {message}")


def request_json(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, json.loads(response.read())


with tempfile.TemporaryDirectory(prefix="r23-d1-") as persist_dir:
    subprocess.run(
        [
            "npx", "wrangler", "d1", "execute", "operaciones-db",
            "--local", "--persist-to", persist_dir,
            "--file", "schema.sql", "-y",
        ],
        cwd=WORKER_DIR,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    seed_sql = """
      INSERT INTO catalogo_articulos
        (codigo,nombre,grupo,subgrupo,unidad,almacen,updated_at)
      VALUES ('A1','VINO SERVIDOR','','','LT','CAVA',1);
      INSERT INTO inv_plantillas
        (almacen,row_map,cantidad_col_idx,pres_map,unit_map,default_pres,raw,
         original_filename,template_hash,updated_at)
      VALUES
        ('CAVA','{"A1":10}',7,'{"A1":[{"nombre":"BOTELLA","factor":0.75}]}',
         '{"A1":"LT"}','{}','','Inventario XTINVTEST.xlsx','tpl-server',
         '2026-07-31T01:00:00.000Z');
    """
    subprocess.run(
        [
            "npx", "wrangler", "d1", "execute", "operaciones-db",
            "--local", "--persist-to", persist_dir,
            "--command", seed_sql, "-y",
        ],
        cwd=WORKER_DIR,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    worker = subprocess.Popen(
        [
            "npx", "wrangler", "dev", "--local",
            "--persist-to", persist_dir,
            "--ip", "127.0.0.1", "--port", str(PORT),
        ],
        cwd=WORKER_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(60):
            try:
                status, _ = request_json("/inv/sesion?almacen=CAVA&fecha=2026-07-31")
                if status == 200:
                    break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.25)
        else:
            raise RuntimeError("Wrangler dev no inició")

        body = {
            "action": "inv_sesion",
            "appVersion": 1,
            "almacen": "CAVA",
            "operario": "Ana Auditora",
            "fecha": "2026-07-31",
            "templateHash": "tpl-server",
            "countsByZone": {"0:dev-a": {"A1": 2}},
            "presChoiceByZone": {"0:dev-a": {"A1": 0.75}},
            "correctionsByZone": {},
            "completedZones": ["0:dev-a"],
            "removeCompletedZones": [],
            "manuales": [{
                "id": "m1",
                "nombre": "BOTELLA MANUAL",
                "cantidad": 1,
                "uni": "PZA",
                "zona": "Racks cava",
                "deviceId": "dev-a",
                "foto": "data:image/jpeg;base64,x",
                "createdAt": "2026-07-31T02:00:00.000Z",
            }],
            "zoneConfigId": "cfg-a",
            "zoneSnapshot": [{
                "nombre": "Racks cava",
                "color": "#166534",
                "items": [{"cod": "A1", "art": "VINO SERVIDOR", "uni": "LT", "grp": ""}],
            }],
            "requestReceipt": True,
            "receiptZoneKey": "0:dev-a",
            "receiptZoneName": "Racks cava",
            "receiptEventId": "close-event-1",
        }
        status, first = request_json("/inv/sesion", "POST", body)
        receipt = first.get("receipt") or {}
        ok(status == 200 and first.get("ok"), "Worker acepta cierre y responde ok")
        ok(re.match(r"^ACU-20260731-[A-F0-9]{24}$", receipt.get("id", "")), "emite folio auditable")
        ok(re.match(r"^[a-f0-9]{64}$", receipt.get("hash", "")), "emite huella SHA-256 completa")
        ok(receipt["items"][0]["name"] == "VINO SERVIDOR", "nombre proviene del catálogo del servidor")
        ok(receipt["items"][0]["baseQuantity"] == 1.5, "servidor calcula cantidad base con factor aceptado")
        ok(receipt["manualItems"][0]["name"] == "BOTELLA MANUAL", "acuse atribuye manual del mismo dispositivo/zona")
        ok(receipt["manualItems"][0]["photoAttached"] is True, "acuse registra evidencia fotográfica")

        status, repeated = request_json("/inv/sesion", "POST", body)
        ok(repeated["receipt"]["id"] == receipt["id"], "reintento del mismo evento es idempotente")
        ok(repeated["receipt"]["receivedAt"] == receipt["receivedAt"], "reintento conserva hora original del acuse")

        status, session = request_json("/inv/sesion?almacen=CAVA&fecha=2026-07-31")
        ok(len(session.get("receipts", [])) == 1, "GET de sesión devuelve el acuse persistido")
        ok("items" not in session["receipts"][0] and session["receipts"][0]["itemCount"] == 1,
           "polling devuelve solo metadata y no repite el payload completo")

        status, verified = request_json("/inv/receipt?id=" + receipt["id"])
        ok(verified.get("verified") is True, "folio se verifica directamente contra el servidor")
        ok(verified["receipt"]["hash"] == receipt["hash"], "verificación devuelve la misma huella")

        subprocess.run(
            [
                "npx", "wrangler", "d1", "execute", "operaciones-db",
                "--local", "--persist-to", persist_dir,
                "--command",
                "UPDATE inv_receipts SET payload_hash = "
                f"'{('0' * 64)}' WHERE id = '{receipt['id']}';",
                "-y",
            ],
            cwd=WORKER_DIR,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        status, tampered = request_json("/inv/receipt?id=" + receipt["id"])
        ok(tampered.get("verified") is False, "verificación detecta una huella almacenada alterada")
        subprocess.run(
            [
                "npx", "wrangler", "d1", "execute", "operaciones-db",
                "--local", "--persist-to", persist_dir,
                "--command",
                "UPDATE inv_receipts SET payload_hash = "
                f"'{receipt['hash']}' WHERE id = '{receipt['id']}';",
                "-y",
            ],
            cwd=WORKER_DIR,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        corrected = json.loads(json.dumps(body))
        corrected["countsByZone"]["0:dev-a"]["A1"] = 3
        corrected["receiptEventId"] = "close-event-2"
        status, second = request_json("/inv/sesion", "POST", corrected)
        ok(second["receipt"]["id"] != receipt["id"], "nuevo cierre corregido emite otro folio")

        status, session = request_json("/inv/sesion?almacen=CAVA&fecha=2026-07-31")
        ok(len(session.get("receipts", [])) == 2, "el servidor conserva acuse original y corregido")
        _, first_after = request_json("/inv/receipt?id=" + receipt["id"])
        _, second_after = request_json("/inv/receipt?id=" + second["receipt"]["id"])
        ok(first_after["receipt"]["items"][0]["baseQuantity"] == 1.5,
           "el acuse original permanece inmutable")
        ok(second_after["receipt"]["items"][0]["baseQuantity"] == 2.25,
           "el segundo acuse refleja la corrección")
    finally:
        worker.terminate()
        try:
            worker.wait(timeout=10)
        except subprocess.TimeoutExpired:
            worker.kill()

print(f"\n✅ smoke R23 Worker: {passed} asserts OK")
