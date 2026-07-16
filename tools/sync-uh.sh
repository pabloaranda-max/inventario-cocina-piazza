#!/usr/bin/env bash
# Sincroniza el espejo de UH: repo inventario-uh → Pages /inventario-uh/.
#
# UH vive en su propia ruta porque Chrome Android permite UNA app instalada
# por scope: en /inventario-cocina-piazza/ el scope de Piazza y el de UH eran
# el mismo y la primera app instalada capturaba a la otra. La copia es
# byte-idéntica: inventario.html detecta el centro por pathname.
#
# Correr después de cada deploy que toque inventario.html, manifest-uh o branding/.
set -euo pipefail
cd "$(dirname "$0")/.."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git clone --depth 1 https://github.com/pabloaranda-max/inventario-uh.git "$TMP"

rm -rf "$TMP"/inventario.html "$TMP"/manifest-uh.webmanifest "$TMP"/branding "$TMP"/index.html "$TMP"/README.md
cp inventario.html manifest-uh.webmanifest "$TMP"/
cp -r branding "$TMP"/branding
touch "$TMP"/.nojekyll
# La raíz /inventario-uh/ redirige a la app para que la URL corta funcione
cat > "$TMP"/index.html <<'HTML'
<!DOCTYPE html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=inventario.html">
<title>Inventario · Universal de Hamburguesas</title>
HTML

cd "$TMP"
git add -A
if git diff --cached --quiet; then
  echo "Espejo UH ya está al día."
else
  git commit -m "sync: espejo desde inventario-cocina-piazza $(date -u +%Y-%m-%dT%H:%MZ)"
  git push origin HEAD
  echo "Espejo UH actualizado."
fi
