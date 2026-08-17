#!/usr/bin/env python3
"""Checkpoints contra el Worker de staging (2026-08-16).

Un checkpoint es un acuse de una zona que SIGUE ABIERTA: cubre la ventana entre
el sync y el cierre, en la que la captura vive solo en inv_sesiones y se puede
destruir. Lo que aquí se verifica es que exista sin aflojar la regla vieja
(un CIERRE sigue exigiendo zona cerrada) y sin ensuciar el polling del operario.

Uso: python3 tests/smoke-worker-checkpoint.py
"""
import json
import sys
import time
import urllib.request

W = "https://operaciones-api-staging.pablo-aranda.workers.dev"
ALM = "CAVA"
FECHA = "2026-01-01"          # fecha de prueba, fuera de cualquier toma real
DEV = f"chk{int(time.time())}"
ZKEY = f"0:{DEV}"

# Cloudflare responde 403 al user-agent por defecto de urllib.
UA = "Mozilla/5.0 (smoke-worker-checkpoint)"

fallos = []
n = 0


def ok(cond, msg):
    global n
    n += 1
    if not cond:
        fallos.append(msg)
        print(f"  ✗ {msg}")
    else:
        print(f"  ✓ {msg}")


def post(body):
    req = urllib.request.Request(
        f"{W}/inv/sesion", method="POST",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        crudo = e.read()
        try:
            return e.code, json.loads(crudo or b"{}")
        except json.JSONDecodeError:
            return e.code, {"error": crudo.decode("utf-8", "replace")[:300]}


def get(path):
    req = urllib.request.Request(f"{W}{path}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def sync(counts, *, kind=None, closed=False, evento=None):
    body = {
        "action": "inv_sesion", "appVersion": 2,
        "almacen": ALM, "fecha": FECHA, "operario": "SMOKE CHECKPOINT",
        "countsByZone": {ZKEY: counts},
        "presChoiceByZone": {ZKEY: {}},
        "completedZones": [ZKEY] if closed else [],
    }
    if kind or closed:
        body.update({
            "requestReceipt": True,
            "receiptZoneKey": ZKEY,
            "receiptZoneName": "Zona smoke",
            "receiptEventId": evento or (f"chk:{ZKEY}" if kind else f"cierre-{DEV}"),
        })
        if kind:
            body["receiptKind"] = kind
    return post(body)


arts = {f"COD{i:03d}": float(i) for i in range(1, 11)}

print(f"Worker: {W}\nZona:   {ZKEY}\n")

# ── 1. Checkpoint sobre zona ABIERTA ───────────────────────────────────────
print("1. Checkpoint con la zona abierta")
st, d = sync(arts, kind="checkpoint")
ok(st == 200, f"el Worker acepta el checkpoint (http {st})")
r1 = d.get("receipt")
ok(bool(r1), "devuelve un acuse")
ok(r1 and r1.get("kind") == "checkpoint", "el acuse viene marcado como checkpoint")
ok(r1 and len(r1.get("items", [])) == 10, "conserva los 10 artículos capturados")

# ── 2. La regla vieja sigue en pie ─────────────────────────────────────────
print("\n2. Un CIERRE sigue exigiendo zona cerrada")
st, d = sync(arts, evento=f"falso-{DEV}")
# sin kind y sin closed no pide acuse; forzamos el caso pidiéndolo explícito
st, d = post({
    "action": "inv_sesion", "appVersion": 2,
    "almacen": ALM, "fecha": FECHA, "operario": "SMOKE CHECKPOINT",
    "countsByZone": {ZKEY: arts}, "presChoiceByZone": {ZKEY: {}},
    "completedZones": [],
    "requestReceipt": True, "receiptZoneKey": ZKEY,
    "receiptZoneName": "Zona smoke", "receiptEventId": f"falso-{DEV}",
})
ok(st == 400, f"acuse de cierre sobre zona abierta → 400 (http {st})")
ok("cerrada" in str(d.get("error", "")), "el error explica que la zona no está cerrada")

# ── 3. Deduplicación por contenido ─────────────────────────────────────────
print("\n3. Deduplicación")
st, d = sync(arts, kind="checkpoint")
r2 = d.get("receipt")
ok(r2 and r2.get("id") == r1.get("id"),
   "mismo contenido → mismo folio, no se crea renglón nuevo")

crecido = dict(arts, COD011=11.0)
st, d = sync(crecido, kind="checkpoint")
r3 = d.get("receipt")
ok(r3 and r3.get("id") != r1.get("id"), "un artículo más → folio nuevo")
ok(r3 and len(r3.get("items", [])) == 11, "el folio nuevo trae los 11")

# ── 4. El polling del operario no ve checkpoints ───────────────────────────
print("\n4. Los checkpoints no ensucian el polling")
s = get(f"/inv/sesion?almacen={ALM}&fecha={FECHA}")
kinds = [x.get("kind") for x in s.get("receipts", [])]
ok("checkpoint" not in kinds, f"/inv/sesion oculta los checkpoints (vio {kinds})")

todos = get(f"/inv/sesion?almacen={ALM}&fecha={FECHA}&receipts=all")
kinds_all = [x.get("kind") for x in todos.get("receipts", [])]
ok(kinds_all.count("checkpoint") >= 2, f"?receipts=all sí los devuelve ({kinds_all})")

# ── 5. El cierre sigue funcionando y se distingue ──────────────────────────
print("\n5. El cierre normal")
st, d = sync(crecido, closed=True)
rc = d.get("receipt")
ok(st == 200 and bool(rc), f"cierre aceptado (http {st})")
# La compatibilidad de huella depende de esto: el payload de un cierre NO tiene
# la clave kind, igual que antes de que existieran los checkpoints. Si algún día
# apareciera, todos los folios ya emitidos dejarían de verificar.
ok(rc and "kind" not in rc, "el payload del cierre no incluye la clave kind")

v = get(f"/inv/receipt?id={rc['id']}")
ok(v.get("verified") is True, "el acuse de cierre verifica su huella")

s = get(f"/inv/sesion?almacen={ALM}&fecha={FECHA}")
propio = next((x for x in s.get("receipts", []) if x.get("id") == rc["id"]), None)
ok(propio is not None, "el cierre sí aparece en el polling del operario")
ok(propio and propio.get("kind") == "cierre",
   "el resumen lo normaliza a 'cierre' aunque el payload no traiga kind")

vc = get(f"/inv/receipt?id={r3['id']}")
ok(vc.get("verified") is True, "el checkpoint también verifica su huella")

# ── limpieza ───────────────────────────────────────────────────────────────
print("\nLimpieza: la sesión de prueba queda en staging (los acuses no se borran).")

print(f"\n{'✅' if not fallos else '❌'} {n - len(fallos)}/{n} asserts")
if fallos:
    for f in fallos:
        print(f"   - {f}")
    sys.exit(1)
