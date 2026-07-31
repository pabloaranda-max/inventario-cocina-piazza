#!/usr/bin/env python3
"""Smoke R25 Worker+D1: una plantilla actualiza un catálogo ya poblado sin borrar
históricos, agrega códigos nuevos, ignora artículos fuera de rowMap y es idempotente."""
import json
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path("/home/lilp/proyectos")
WORKER_DIR = ROOT / "worker/operaciones-api"
PORT = 8801
BASE = f"http://127.0.0.1:{PORT}"
ADMIN_PASSWORD = "smoke-r25"
passed = 0


def ok(condition, message):
    global passed
    if not condition:
        print(f"❌ {message}")
        sys.exit(1)
    passed += 1
    print(f"✓ {message}")


def request_json(path, method="GET", body=None, admin=False):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if admin:
        headers["X-Admin-Password"] = ADMIN_PASSWORD
    request = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status, json.loads(response.read())


with tempfile.TemporaryDirectory(prefix="r25-d1-") as persist_dir:
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
      VALUES
        ('HIST1','HISTORICO','GRUPO HIST','SUB HIST','PZA','CAVA',1),
        ('A1','NOMBRE VIEJO','GRUPO RICO','SUB RICO','LT','CAVA',1);
      INSERT INTO inv_plantillas
        (almacen,row_map,cantidad_col_idx,pres_map,unit_map,default_pres,raw,
         original_filename,template_hash,updated_at)
      VALUES
        ('CAVA','{"A1":10}',7,'{}','{"A1":"LT"}',
         '{"LT":[{"nombre":"BOTELLA","factor":0.75}]}','raw-viejo',
         'Inventario XTINVOLD.xlsx','tpl-old','2026-07-31T01:00:00.000Z');
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
            "--var", f"INV_ADMIN_PASSWORD:{ADMIN_PASSWORD}",
        ],
        cwd=WORKER_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(60):
            try:
                status, _ = request_json("/inv/plantilla?almacen=CAVA")
                if status == 200:
                    break
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.25)
        else:
            raise RuntimeError("Wrangler dev no inició")

        body = {
            "action": "inv_plantilla",
            "appVersion": 2,
            "almacen": "CAVA",
            "rowMap": {"A1": 20, "NEW2": 21},
            "cantidadColIdx": 7,
            "presMap": {"NEW2": [{"nombre": "BOTELLA DE 1 LT", "factor": 1}]},
            "unitMap": {"A1": "LT", "NEW2": "LT"},
            "raw": "raw-nuevo",
            "originalFilename": "Inventario XTINVNEW.xlsx",
            "templateHash": "tpl-new",
            "articulos": [
                {
                    "codigo": "A1", "nombre": "NOMBRE ACTUALIZADO",
                    "grupo": "", "subgrupo": "", "unidad": "LT",
                },
                {
                    "codigo": "NEW2", "nombre": "ARTICULO NUEVO",
                    "grupo": "VINOS", "subgrupo": "TINTOS", "unidad": "LT",
                },
                {
                    "codigo": "OUTSIDE", "nombre": "NO DEBE ENTRAR",
                    "grupo": "", "subgrupo": "", "unidad": "PZA",
                },
            ],
        }

        status, first = request_json("/inv/plantilla", "POST", body, admin=True)
        ok(status == 200 and first.get("ok"), "Worker acepta la plantilla autenticada")
        ok(first.get("catalogoSincronizado") == 2, "reporta solo los 2 artículos de rowMap")
        ok(first.get("catalogoDerivado") == 0, "no declara catálogo nuevo cuando ya existía")

        _, catalog = request_json("/articulos?almacen=CAVA")
        articles = {item["codigo"]: item for item in catalog.get("articulos", [])}
        ok(set(articles) == {"HIST1", "A1", "NEW2"}, "agrega NEW2 sin borrar HIST1")
        ok(articles["A1"]["nombre"] == "NOMBRE ACTUALIZADO", "actualiza el nombre vigente")
        ok(
            articles["A1"]["grupo"] == "GRUPO RICO" and articles["A1"]["subgrupo"] == "SUB RICO",
            "campos vacíos de la plantilla no borran metadatos existentes",
        )
        ok(articles["NEW2"]["nombre"] == "ARTICULO NUEVO", "el código nuevo conserva su nombre")
        ok("OUTSIDE" not in articles, "un artículo fuera de rowMap no contamina el catálogo")

        _, template = request_json("/inv/plantilla?almacen=CAVA")
        ok(
            template.get("templateHash") == "tpl-new"
            and template.get("originalFilename") == "Inventario XTINVNEW.xlsx",
            "la plantilla se reemplaza después de sincronizar el catálogo",
        )
        ok(
            template.get("defaultPres", {}).get("LT", [{}])[0].get("factor") == 0.75,
            "la recarga conserva las presentaciones por defecto",
        )

        _, repeated = request_json("/inv/plantilla", "POST", body, admin=True)
        _, catalog_after = request_json("/articulos?almacen=CAVA")
        ok(repeated.get("catalogoSincronizado") == 2, "repetir la carga sigue sincronizando")
        ok(len(catalog_after.get("articulos", [])) == 3, "repetir la carga es idempotente")
    finally:
        worker.terminate()
        try:
            worker.wait(timeout=10)
        except subprocess.TimeoutExpired:
            worker.kill()

print(f"\n✅ smoke R25 catálogo incremental: {passed} asserts OK")
