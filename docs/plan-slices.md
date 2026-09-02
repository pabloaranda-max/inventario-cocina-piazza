# [SUPERADO 2026-07-08] Plan por slices — Inventario Piazza Pasticcio

> ⚠️ **Este documento fue reemplazado por `docs/inventario-spec.md` §15 (Plan Slices v2).**
> No ejecutar slices desde aquí. Se conserva solo como registro histórico de las
> decisiones del 2026-07-02 (Slice 0 completado, scraper estacionado, staging creado).

> Versión 1.0 — 2026-07-02. Documento ejecutable: cada slice se trabaja en UNA sesión de IA,
> con el prompt listo para pegar. Contexto completo del sistema: ver
> `inventario-piazza-contexto-ia.txt` (Desktop) y `docs/inventario-spec.md` (repo).
> Filosofía vigente: "el spec informa; el test grita" — tests solo donde ya hubo falla real.

## Verificaciones ya hechas (2026-07-02) — no repetir

- ✅ Secrets del Worker existen: `INV_ADMIN_PASSWORD`, `INV_SUPERVISOR_PIN`, `SYNC_TOKEN`
- ⚠️ **El repo `inventario-cocina-piazza` es PÚBLICO** (igual que `brainalimentaripasticiob2b`).
  El fallback hardcodeado `'adminpasticcio2026'` en `worker/operaciones-api/src/index.js:638,672`
  está expuesto en GitHub → rotar password es parte del Slice 0.
- ⚠️ Worker legacy `piazza-operaciones` sigue desplegado (último deploy 2026-03-27). Lo
  referencian: las 6 apps HTML viejas (backup), `operaciones.html`, y `scraper/sync_d1.py`
  vía env var `WORKER_URL` (verificar el valor del secret en GitHub Actions antes de borrar).
- ⚠️ Hay DOS repos de scraper con crons: `scraper/` en este monorepo (workflows
  `.github/workflows/scraper-*.yml`) y `hackatongourmet/restaurant-app/scraper/` que es un
  repo git independiente (piazza-scraper) con sus propios workflows.

## Decisiones tomadas (no re-discutir)

1. **BARRA_RESTAURANTE 2026-07-01: cerrado.** Tomas y cargas terminadas. El freeze del
   spec §0 queda levantado. Los bugs de zonas no se recuerdan en detalle → se atacan
   estructuralmente con zonas editables (Slice 4); cuando reaparezcan, documentarlos frescos.
2. **Scraper: SE ESTACIONA.** Falla casi a diario y no es carga-portante para inventario
   (las plantillas llegan por admin.html y el catálogo se complementa desde el xlsx desde
   el commit 504edd8). Acción mínima: desactivar los crons que fallan para parar el ruido.
   Revivirlo es un proyecto aparte, fuera de este plan.
3. **Apps Script: SE MANTIENE por ahora** como canal a Sheets. Riesgo aceptado
   (fire-and-forget sin confirmación). Migrar a Sheets API (service account + JWT en el
   Worker) queda como Slice 4b OPCIONAL futuro — costo alto, beneficio menor que zonas
   editables.
4. **Staging: SÍ, mínimo.** `env.staging` en wrangler.toml de operaciones-api + una D1
   clonada. Se usa SOLO en slices que tocan el Worker. El frontend se prueba local
   (`python -m http.server`) apuntando al worker de staging.
5. **Modelos:** Fable planea/revisa diffs antes de merge; Sonnet (o Codex) ejecuta cada
   slice. Una sesión = un slice. main es producción (GitHub Pages) — mergear solo verificado.
6. **Almacén de prueba: CAVA** (el más estable). Si el slice afecta multi-zona, probar
   también ALIMENTARI.

---

## SLICE 0 — Higiene y seguridad inmediata (~1 sesión corta) — ⚠️ CASI COMPLETO (verificado 2026-07-05)

Password rotado y fallback eliminado (deploy en prod, verificado). Staging creado
(`operaciones-api-staging` + D1 propia). PATs embebidos reemplazados por `gh auth` +
credential helper en los 3 remotes (origin, brainalimentari, piazza-scraper). Crons
del scraper pausados y pusheados en ambos repos. `piazza-operaciones` (Worker + D1)
borrados en Cloudflare; código archivado en `legacy/worker-piazza-operaciones/`.
Pendiente opcional de higiene: revocar manualmente en github.com/settings/tokens los
PAT viejos de origin/brainalimentari (ya no se usan, pero siguen siendo válidos).

**GAP encontrado en revisión 2026-07-05:** en el repo `piazza-scraper`
(hackatongourmet/restaurant-app/scraper) solo se desactivó el cron de
`sync_catalogo.yml` (commit `a86dbb4`). **`scraper_diario.yml` sigue con `schedule:`
activo** (`cron: '30 5 * * *'`) — es el workflow que corre `scraper_reportes.py`, el
que falla casi a diario según las notas de este mismo plan. `reporte_semanal.yml`
también sigue activo pero es intencional (reporte Slack funcionando). Pablo decidió
(2026-07-05) dejarlo así por ahora, sin tocar — pendiente de retomar cuando se
decida.


**Objetivo:** cerrar lo expuesto públicamente y limpiar el terreno. No toca funcionalidad.

Tareas:
1. Rotar `INV_ADMIN_PASSWORD` (`wrangler secret put INV_ADMIN_PASSWORD` en
   `worker/operaciones-api`) — el valor viejo puede estar comprometido (repo público).
   Avisar a quien use admin.html del password nuevo.
2. Quitar el fallback hardcodeado en `src/index.js` (líneas ~638 y ~672): si
   `env.INV_ADMIN_PASSWORD` no existe → responder 500, nunca caer a una constante.
   Deploy con `wrangler deploy`.
3. Rotar los PAT de GitHub embebidos en `.git/config` (remotes `origin` y
   `brainalimentari`): `gh auth login` + `gh auth setup-git`, reescribir los remotes sin
   token en la URL, revocar los PAT viejos en GitHub.
4. Desactivar los crons del scraper que fallan a diario: en `.github/workflows/scraper-*.yml`
   comentar el bloque `schedule:` (dejar `workflow_dispatch` para correr a mano). Hacer lo
   mismo en el repo piazza-scraper si también truena.
5. `piazza-operaciones` (worker legacy): verificar el secret `WORKER_URL` en los GitHub
   Actions de ambos repos de scraper; si nada activo apunta a él → `wrangler delete` desde
   `worker/piazza-operaciones`. Las 6 apps HTML viejas que lo referencian son backup y
   está bien que queden rotas.
6. Crear staging: bloque `[env.staging]` en `worker/operaciones-api/wrangler.toml` con una
   D1 nueva (`wrangler d1 create operaciones-db-staging`, aplicar `schema.sql` +
   `migrations/`), deploy con `wrangler deploy --env staging`.

**Done cuando:** password rotado y fallback eliminado en producción, PATs rotados, crons
silenciados, decisión ejecutada sobre piazza-operaciones, staging responde.

**Rollback:** `wrangler rollback` para el Worker; los demás pasos son reversibles por git.

**Prompt para la sesión:**
> Lee plan-slices.md (Slice 0) e inventario-spec.md. Ejecuta las 6 tareas del Slice 0 en
> orden. No toques inventario.html ni admin.html. Pídeme el valor nuevo del password y
> confirma conmigo antes de borrar el worker piazza-operaciones.

---

## SLICE 1 — Autenticación de endpoints de admin (~1 sesión)

**Objetivo:** que subir/sobreescribir plantillas y defaults requiera el password admin.
`inv_sesion` e `inv_lock` quedan SIN auth a propósito (el operario no tiene credencial;
riesgo aceptado: solo corrompe una sesión en curso, no el cierre).

Tareas:
1. Worker: exigir header `X-Admin-Password` == `env.INV_ADMIN_PASSWORD` en:
   `POST /inv/plantilla` (acciones `inv_plantilla` e `inv_defaults`). `inv_export` ya
   valida password en el body — dejarlo como está.
   Sin hashes ni tokens derivados: password directo por HTTPS es equivalente y más simple.
2. admin.html: pedir el password una vez al entrar (ya existe login admin — reutilizarlo),
   guardarlo en memoria de la página (variable JS, NO localStorage) y añadir el header a
   los fetch de plantilla/defaults.
3. Probar en staging primero: subir una plantilla de CAVA a staging con y sin header.

**Done cuando:** en producción, un POST de plantilla sin header devuelve 401 y admin.html
sigue subiendo plantillas normal. inventario.html no se toca y sigue funcionando.

**Rollback:** `wrangler rollback` + revert del commit de admin.html.

**Prompt para la sesión:**
> Lee plan-slices.md (Slice 1) e inventario-spec.md §7. Implementa el header
> X-Admin-Password en los dos endpoints indicados del Worker y en los fetch
> correspondientes de admin.html. Prueba en staging (--env staging) antes de deploy a
> producción. No toques inventario.html.

---

## SLICE 2 — Módulos puros compartidos + fixture del parser (~1 sesión)

**Objetivo:** una sola implementación de las reglas de negocio (spec §12 Fase 1+3). El
parser YA falló en producción (BARRA_RESTAURANTE) → aquí SÍ van tests.

Tareas:
1. Extraer de admin.html → `js/plantilla-parser.js` (módulo ES sin DOM):
   `parsePlantilla(buffer)`, `hashRaw(raw)`, reglas R1–R5 del spec §5.
2. Extraer de inventario.html/admin.html → `js/sesion-merge.js` (sin DOM): merge de
   countsByZone/presChoiceByZone/manuales/completedZones y cálculo de totales con factor.
3. Ambos HTML cargan los módulos con `<script type="module">`. Todo lo demás queda igual
   (NO reestructurar el resto del código, NO mover los HTML de lugar — las URLs de los
   operarios no cambian).
4. Fixture: `tests/fixtures/cava-synthetic.xlsx` (casos del spec §12 Fase 1: base LT+0.75,
   KG, PZA factor 12, R1 factor 1.0 ignorado, R2 mL/g ignorado, doble presentación, sin
   presentación) + `tests/test-parser.html` con asserts inline. Abrirlo en el navegador =
   correr los tests.
5. Alinear `tools/merge_inventario.py` con las mismas reglas (revisar divergencias de
   match por código y factor). El script se CONSERVA como auditor dry-run obligatorio
   antes de cada carga real a Xetux — su validation_report.json es la auditoría oficial.

**Done cuando:** test-parser.html pasa en verde, inventario.html y admin.html funcionan
igual que antes (probar flujo completo en CAVA: seleccionar almacén, contar, guardar,
exportar desde admin y comparar el xlsx con uno generado antes del cambio — deben ser
idénticos en la columna Cantidad).

**Rollback:** revert del commit; los HTML viejos quedan en el historial.

**Prompt para la sesión:**
> Lee plan-slices.md (Slice 2) e inventario-spec.md §5 y §12. Extrae plantilla-parser.js
> y sesion-merge.js como módulos puros sin DOM, crea el fixture y test-parser.html, y
> verifica que el xlsx exportado desde admin.html es byte-idéntico en cantidades a uno
> pre-cambio. No reestructures nada más de los HTML.

---

## SLICE 3 — Limpieza (~1 sesión corta, puede combinarse con la 2 si sobra ventana)

Tareas:
1. Borrar CSS muerto listado en spec §13.
2. Mover barra/cocina/alimentari/cava/salumeria/general.html + operaciones.html a
   `legacy/` (siguen en git; sus URLs viejas de GitHub Pages se rompen — aceptado).
3. Quitar el chat GROQ de admin.html (o si se usa, dejarlo con una advertencia de que la
   key vive en localStorage). Las copias en legacy/ no se tocan.
4. Actualizar inventario-spec.md a v4.7 reflejando slices 0–3.

**Done cuando:** inventario.html y admin.html funcionan igual (smoke test en CAVA) y el
repo raíz solo tiene los archivos vivos.

---

## SLICE 4 — Zonas editables (spec §14) (~1–2 sesiones)

**Objetivo:** eliminar zonas hardcodeadas; el admin prepara cada toma. Es el fix
estructural de los bugs de zonas de BARRA_RESTAURANTE.

Seguir los 7 pasos del spec §14 tal cual (tabla `inv_zone_configs`, endpoints
`/inv/zone-config` con password admin, editor en admin.html, `zoneSnapshot` congelado por
sesión, migrar BARRA_RESTAURANTE al final). Migración D1 numerada:
`migrations/0003_zone_configs.sql`, aplicar primero en staging.

**Regla crítica:** una sesión existente se renderiza SIEMPRE desde su `zoneSnapshot`,
nunca desde la config activa. Probar: editar una preparación con una toma abierta y
verificar que la toma no cambia.

**Done cuando:** una toma completa en CAVA (o BARRA_RESTAURANTE si hay conteo programado)
se hace con preparación editable de punta a punta y el export sale correcto.

**Prompt para la sesión:**
> Lee plan-slices.md (Slice 4) e inventario-spec.md §14 completo. Implementa los pasos
> 1–5 de la migración gradual (deja 6–7 para cuando haya una toma verificada). Migración
> D1 primero en staging. Respeta la regla del zoneSnapshot.

---

## SLICE 4b — OPCIONAL / FUTURO — Sheets API en vez de Apps Script

Estacionado por decisión del 2026-07-02. Solo retomar si el canal Apps Script falla en
un cierre real. Implica: proyecto Google Cloud + service account + firma JWT RS256 con
WebCrypto en el Worker + compartir cada Sheet a la cuenta de servicio + retirar los 6
Apps Script y AREA_CONFIG.appsScriptUrl.

---

## Reglas transversales de ejecución

- Rama `slice/N` desde main por slice; merge a main solo con el "Done cuando" cumplido.
- Worker: staging primero si el slice lo toca; `wrangler tail` corriendo durante la
  prueba manual en producción.
- Cada slice termina actualizando inventario-spec.md (es el contrato vivo).
- Antes de cualquier carga real a Xetux: `tools/merge_inventario.py` en dry-run y revisar
  `validation_report.json` (práctica obligatoria, ya establecida).
- Nunca committear secrets; los tres viven en `wrangler secret`.
