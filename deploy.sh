#!/bin/bash
# Deploy Alimentari B2B
# Uso:
#   ./deploy.sh            → solo frontend (GitHub Pages)
#   ./deploy.sh --worker   → frontend + Cloudflare Worker
#
# Requiere CLOUDFLARE_API_TOKEN en el entorno para --worker:
#   export CLOUDFLARE_API_TOKEN="cfut_..."

set -e  # detiene el script si cualquier comando falla

FRONTEND_FILE="brainalimentarib2b.html"
DEPLOY_BRANCH="deploy-filters"
REMOTE="brainalimentari"
WORKER_DIR="worker/piazza-api"

# ── Colores para el output ────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # sin color

ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${YELLOW}→${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── Validaciones previas ──────────────────────────────────────────
[ ! -f "$FRONTEND_FILE" ] && err "No se encontró $FRONTEND_FILE"

if [[ "$1" == "--worker" ]]; then
  [ -z "$CLOUDFLARE_API_TOKEN" ] && err "Falta CLOUDFLARE_API_TOKEN. Ejecuta: export CLOUDFLARE_API_TOKEN=\"tu-token\""
fi

# ── Guardar rama actual ───────────────────────────────────────────
RAMA_ACTUAL=$(git branch --show-current)
[ -z "$RAMA_ACTUAL" ] && err "No estás en ninguna rama (detached HEAD?)"

# Garantiza volver a la rama original aunque el script falle
cleanup() {
  if [ "$(git branch --show-current)" != "$RAMA_ACTUAL" ]; then
    git checkout "$RAMA_ACTUAL" --quiet 2>/dev/null || true
    git stash pop --quiet 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Guardar cambios no commiteados si los hay ─────────────────────
TIENE_CAMBIOS=false
if ! git diff --quiet || ! git diff --cached --quiet; then
  TIENE_CAMBIOS=true
fi

# ── Deploy frontend ───────────────────────────────────────────────
info "Copiando $FRONTEND_FILE a /tmp para el deploy..."
cp "$FRONTEND_FILE" /tmp/alimentari_deploy.html

info "Cambiando a rama $DEPLOY_BRANCH..."
git stash --quiet
git checkout "$DEPLOY_BRANCH" --quiet

info "Actualizando index.html..."
cp /tmp/alimentari_deploy.html index.html
git add index.html

FECHA=$(date '+%Y-%m-%d %H:%M')
if git diff --cached --quiet; then
  ok "Frontend sin cambios, no es necesario redesplegar"
else
  git commit -m "deploy: $FECHA" --quiet
  info "Subiendo a GitHub Pages ($REMOTE)..."
  git push "$REMOTE" "$DEPLOY_BRANCH:main" --quiet
  ok "Frontend desplegado en GitHub Pages"
fi

# ── Volver a la rama original ─────────────────────────────────────
git checkout "$RAMA_ACTUAL" --quiet
if $TIENE_CAMBIOS; then
  git stash pop --quiet
fi

# ── Deploy worker (opcional) ──────────────────────────────────────
if [[ "$1" == "--worker" ]]; then
  echo ""
  info "Deployando Cloudflare Worker..."
  source ~/.nvm/nvm.sh --no-use
  nvm use 20 --silent

  cd "$WORKER_DIR"
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" npx wrangler deploy --quiet
  cd - > /dev/null

  ok "Worker desplegado en Cloudflare"
fi

echo ""
ok "Deploy completo — $FECHA"
