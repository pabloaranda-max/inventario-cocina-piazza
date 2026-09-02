#!/usr/bin/env bash
# Respalda la base D1 de inventarios (operaciones-db) a ~/backups.
#
# Uso:   ./tools/respaldo-d1.sh
#
# Requiere sesion de Cloudflare (wrangler login). No necesita ningun token.
# Verifica que el volcado no este corrupto antes de darlo por bueno y conserva
# los ultimos 10.
#
# Lo que se protege aqui es la CONFIGURACION: catalogos, plantillas con sus
# presentaciones por defecto, zonas, admins y recibos. El historial de tomas no
# vive en D1 -- una vez subida la toma, la fuente de verdad es Xetux.

set -euo pipefail

DB="operaciones-db"
DIR="${HOME}/backups"
CONSERVAR=10
DEST="${DIR}/operaciones-db-backup-$(date +%F).sql"

cd "$(dirname "$0")/../worker/operaciones-api"
mkdir -p "$DIR"

echo "→ exportando ${DB}..."
wrangler d1 export "$DB" --remote --output="$DEST" >/dev/null

if [ ! -s "$DEST" ]; then
  echo "✗ el archivo salio vacio — respaldo ABORTADO" >&2
  rm -f "$DEST"; exit 1
fi

echo "→ verificando integridad..."
python3 - "$DEST" <<'PY'
import sqlite3, sys, pathlib
sql = pathlib.Path(sys.argv[1]).read_text()
con = sqlite3.connect(":memory:")
try:
    con.executescript(sql)
except Exception as e:
    print(f"✗ el volcado no carga: {e}", file=sys.stderr); sys.exit(1)
tablas = [r[0] for r in con.execute(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
total = 0
for t in sorted(tablas):
    n = con.execute(f'select count(*) from "{t}"').fetchone()[0]
    total += n
    if n: print(f"    {t}: {n} filas")
if total == 0:
    print("✗ el respaldo no tiene ni una fila — ABORTADO", file=sys.stderr); sys.exit(1)
print(f"  ✓ {len(tablas)} tablas, {total} filas en total")
PY

echo "✓ $DEST ($(du -h "$DEST" | cut -f1))"

sobran=$(ls -t "${DIR}"/operaciones-db-backup-*.sql 2>/dev/null | tail -n +$((CONSERVAR+1)) || true)
if [ -n "$sobran" ]; then
  echo "→ borrando respaldos viejos (se conservan ${CONSERVAR}):"
  echo "$sobran" | while read -r f; do echo "    $(basename "$f")"; rm -f "$f"; done
fi
