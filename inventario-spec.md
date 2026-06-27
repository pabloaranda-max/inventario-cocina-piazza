# inventario.html — Especificación técnica v4

> Última actualización: 2026-06-27.

---

## 1. Contexto

`inventario.html` reemplaza 6 apps separadas (barra.html, cocina.html, alimentari.html, cava.html, salumeria.html, general.html). Los archivos originales se conservan como backup.

Problema resuelto: sync parcial por zona — cada dispositivo solo manda su zona activa, el Worker hace merge sin tocar las otras zonas.

---

## 2. Almacenes y zonas

| Almacén | Zonas | Fuente de ítems |
|---|---|---|
| `BARRA_RESTAURANTE` | Almacén Barra · Refri Almacén Barra · Contra Barra · Refris de Servicio | Hardcodeado en AREA_CONFIG |
| `BARRA_AMICI` | Barra Amici (zona única) | D1 (catálogo vacío al momento) |
| `ALIMENTARI` | Almacén · Tienda | D1 (catálogo replicado en ambas zonas) |
| `CAVA` | Racks cava · Refri cava 1 · Refri cava 2 | D1 (replicado) |
| `COCINA` | Cocina (zona única) | D1 |
| `GENERAL` | General (zona única) | D1 |
| `SALUMERIA` | Camara maduracion · Congelador horizontal · Refri · Camara fria | D1 (replicado) |

**Zonas con `zonaNames`:** el catálogo D1 se replica en N zonas idénticas. El operario de cada zona ve los mismos ítems; los conteos son independientes por zona y se suman al exportar.

---

## 3. Arquitectura

```
[inventario.html]
  └─ localStorage (prefijado por almacén)
       xtux_s_{ALMACEN}   → sesión completa (ver §6)
       inv_device_id       → ID único del dispositivo

  └─ Cloudflare Worker: operaciones-api.pablo-aranda.workers.dev
       GET  /articulos?almacen=X            ← catálogo D1
       GET  /inv/plantilla?almacen=X        ← plantilla Xetux (PENDIENTE)
       POST /inv/plantilla                  ← solo desde admin.html (PENDIENTE)
       GET  /inv/sesion?almacen=X&fecha=Y
       POST /inv/sesion  (inv_sesion | inv_lock)

  └─ [admin.html] → POST /inv/plantilla    ← upload de plantilla por almacén
  └─ Google Apps Script (por almacén) → Sheets
```

**Decisión de plantilla:** la plantilla Xetux se gestiona desde `admin.html`, no desde `inventario.html`. Al seleccionar un almacén, `inventario.html` la descarga del Worker automáticamente. No hay pantalla de importación para operarios.

---

## 4. AREA_CONFIG

```js
const APPS = 'https://script.google.com/macros/s/';
const AREA_CONFIG = {
  BARRA_RESTAURANTE: {
    titulo: 'Barra Restaurante', color: '#667eea',
    appsScriptUrl: APPS + 'AKfycby_lsQ9Rn36eAP7zQJrvGjCfDD_rAIhkDSsfYTL8UWg-jYB0YkVdR_uXD-fb0BZvF60BQ/exec',
    zonas: [ /* hardcodeadas — 4 zonas, ver código fuente */ ]
  },
  COCINA:    { titulo: 'Cocina',    color: '#f59e0b',
               appsScriptUrl: APPS + 'AKfycbyTJ-jeve3udC1mAuhcmjlUwY0oiJO2HMu55ovpUa5z48JX2j1K25BsVULrgr_tnIQ/exec',
               zonas: null },
  ALIMENTARI:{ titulo: 'Alimentari', color: '#10b981',
               appsScriptUrl: APPS + 'AKfycbxgmVa9zMMYy0eGe8zFEVnoUuZWPH1w9cgT2oxBXI307N5eMD6vLnfd88Aovo6n6spO/exec',
               zonas: null, zonaNames: ['Almacén','Tienda'], zonaColors: ['#10b981','#0d9488'] },
  CAVA:      { titulo: 'Cava',      color: '#8b5cf6',
               appsScriptUrl: APPS + 'AKfycbzQ7Pwt-rv9mPxCOzXkbI6gisss9FVtFzJyKWHGZbQOOMDHrJESa55UTNWriDUeH94B/exec',
               zonas: null, zonaNames: ['Racks cava','Refri cava 1','Refri cava 2'], zonaColors: ['#8b5cf6','#7c3aed','#6d28d9'] },
  SALUMERIA: { titulo: 'Salumeria', color: '#ef4444',
               appsScriptUrl: APPS + 'AKfycbwJ89hDt3pIyXwiQkbSaL7--Fr-DXTsFm5tTgo-rKoCc-G0fR14iJKqyjVwRCO3XC_3/exec',
               zonas: null, zonaNames: ['Camara maduracion','Congelador horizontal','Refri','Camara fria'], zonaColors: ['#ef4444','#dc2626','#b91c1c','#991b1b'] },
  GENERAL:   { titulo: 'General',   color: '#6b7280',
               appsScriptUrl: APPS + 'AKfycbyg1vJUxEGFaHs8V1co2rLxY8IA5h-Ol23-peGDg-Hdon-kI81F_r7Rx9Yey9OdNFQtVg/exec',
               zonas: null },
  BARRA_AMICI: { titulo: 'Barra Amici', color: '#f97316',
                 appsScriptUrl: null,
                 zonas: null }
};
```

**`appsScriptUrl: null`:** ocultar botón "Enviar a Sheets", no hacer fetch silencioso.

---

## 5. Gestión de plantilla Xetux

### Responsabilidad

- **admin.html** sube la plantilla por almacén (POST /inv/plantilla)
- **inventario.html** la descarga automáticamente al seleccionar almacén (GET /inv/plantilla)
- No hay pantalla de importación en inventario.html

### Flujo en inventario.html al seleccionar almacén

```
selectArea(key)
  → resolveZonas()      ← GET /articulos?almacen=X
  → fetchPlantilla()    ← GET /inv/plantilla?almacen=X
       si 404/vacía → T = null, continuar sin plantilla
       si ok → parsear respuesta → T = { rowMap, cantidadColIdx, presMap, templateHash, templateTs }
  → si sesión activa en Worker → cargarla y mostrar overview
  → si no → mostrar pantalla de nueva sesión
```

Si T = null: ocultar botón "Generar Excel para Xetux", mostrar aviso "Plantilla no configurada — contacta al administrador".

### Formato del archivo (con presentaciones activadas)

```
Col:  0    1        2          3              4       5       6
      #    Código   Producto   Presentación   Unidad  Factor  Cantidad
      1    MP0001   ACEITE     —              LT      —       0
           —        —          BOTELLA        —       0.75    —
           —        —          LITRO          —       1.0     —
```

- Fila producto: col 0 con `#`, col 1 código, col 2 nombre, col 4 unidad
- Fila presentación: col 0 vacío, col 3 nombre presentación, col 5 factor

### Reglas de extracción (presMap)

```
R1: factor == 1.0              → ignorar
R2: factor > 10 AND uni ∈ {LT,KG} → ignorar (error Xetux: mL/g)
R3: factor > 1  AND uni == PZA → válido (caja, paquete, bulto)
R4: mismo factor, distintos nombres → deduplicar por valor
R5: múltiples factores válidos → conservar todos → selector en UI
```

### Versionado

```js
// SHA-256 determinístico via crypto.subtle (async)
async function hashRaw(raw) {
  const buf = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2,'0')).join('').slice(0, 16);
}
```

Si `T.templateHash !== S.templateHash` → advertencia visible. No bloquear exportación.

---

## 6. Modelo de sesión

```js
S = {
  operario:          'Juan',
  fecha:             '2026-06-26',
  templateHash:      '1f4a2b-c3d4e5f6',
  countsByZone: {
    '0': { 'MP0001': 3.5, 'XMAT001': 2 },
    '2': { 'MP0001': 1 }       // mismo cod, zona distinta = cantidad independiente
  },
  presChoiceByZone: {           // por zona — mismo cod puede tener factor distinto por zona
    '0': { 'XMAT2409000106': 2.9 },
    '2': { 'XMAT2409000106': 4.2 }
  },
  completedZones: [0, 2],
  manuales: [
    {
      id:        'dev_xyz-abc123-r4nd',  // deviceId-ts36-random
      nombre:    'Salsa de la casa',
      cantidad:  2,
      uni:       'LT',
      zona:      'Contra Barra',
      foto:      'data:image/jpeg;base64,...',  // canvas max 800px JPEG75
      deviceId:  'dev_xyz',
      createdAt: '2026-06-26T20:00:00Z'
    }
  ]
}
```

**Sync parcial:** cada dispositivo solo manda su zona activa (`CZ`). Si `CZ = null`, `countsByZone = {}` — el Worker interpreta `{}` como "sin cambios en conteos", no como "borrar todo".

---

## 7. Worker — contratos de API

### GET /inv/plantilla?almacen=X

Response si existe:
```json
{ "ok": true, "found": true,
  "rowMap": { "MP0001": 17, "XMAT001": 42 },
  "cantidadColIdx": 6,
  "presMap": {}, "templateHash": "sha256hex...", "templateTs": 1719360000000,
  "raw": "base64..." }
```
Response si no: `{ "ok": true, "found": false }`

### POST /inv/plantilla

Desde admin.html únicamente.

Request:
```json
{ "action": "inv_plantilla", "almacen": "CAVA",
  "rowMap": { "MP0001": 17 }, "cantidadColIdx": 6,
  "presMap": {}, "templateHash": "sha256hex...", "templateTs": 1719360000000,
  "raw": "base64..." }
```
Response: `{ "ok": true }`

### GET /inv/sesion?almacen=X&fecha=Y

Response:
```json
{
  "ok": true, "found": true,
  "operario": "Juan", "fecha": "2026-06-26",
  "templateHash": "1f4a2b",
  "countsByZone": { "0": { "MP001": 2 } },
  "presChoiceByZone": { "0": { "XMAT001": 0.75 } },
  "completedZones": [0],
  "lockedZones": { "1": { "device_id": "dev_x", "operario": "Ana", "ts": "..." } },
  "manuales": [],
  "updatedAt": "2026-06-26T20:00:00Z"
}
```
Si `found: false` → `{ "ok": true, "found": false }`.

### POST /inv/sesion (action: inv_sesion)

```json
{ "action": "inv_sesion", "almacen": "CAVA", "operario": "Juan",
  "fecha": "2026-06-26", "templateHash": "1f4a2b",
  "countsByZone": { "0": { "MP001": 2 } },
  "presChoiceByZone": { "0": { "XMAT001": 0.75 } },
  "completedZones": [0],
  "manuales": [ { "id": "man_abc", ... } ] }
```

**Merge en Worker:**
```js
// countsByZone — merge por zona (zona A no toca zona B)
const mergedCBZ = { ...existingCBZ };
for (const [zid, zc] of Object.entries(incomingCBZ)) {
  mergedCBZ[zid] = { ...(mergedCBZ[zid] || {}), ...zc };
}
// presChoiceByZone — igual
// manuales — merge por id (incoming gana)
// completedZones — union
```

### POST /inv/sesion (action: inv_lock)

```json
{ "action": "inv_lock", "almacen": "CAVA", "fecha": "2026-06-26",
  "zone_idx": 1, "device_id": "dev_x", "operario": "Ana", "release": false }
```

Lock TTL: 30 minutos. Al inicio de cualquier operación de lock, expirar locks viejos.

Response exitoso: `{ "ok": true, "locks": { ... } }`
Response denegado: `{ "ok": false, "locked_by": { "operario": "Ana", "ts": "..." } }`

---

## 8. Esquema D1

### inv_sesiones (existente + migraciones aplicadas)

```sql
-- columna legacy (barra.html la sigue usando)
counts TEXT DEFAULT '{}'

-- columnas nuevas (ya aplicadas en producción)
ALTER TABLE inv_sesiones ADD COLUMN counts_by_zone      TEXT DEFAULT '{}';
ALTER TABLE inv_sesiones ADD COLUMN pres_choice_by_zone TEXT DEFAULT '{}';
ALTER TABLE inv_sesiones ADD COLUMN manuales            TEXT DEFAULT '[]';
ALTER TABLE inv_sesiones ADD COLUMN template_hash       TEXT DEFAULT '';
```

### inv_plantillas (nueva — PENDIENTE)

```sql
CREATE TABLE IF NOT EXISTS inv_plantillas (
  almacen        TEXT PRIMARY KEY,
  template_hash  TEXT NOT NULL DEFAULT '',
  template_ts    INTEGER NOT NULL DEFAULT 0,
  row_map        TEXT NOT NULL DEFAULT '{}',
  cantidad_col   INTEGER NOT NULL DEFAULT 6,
  pres_map       TEXT NOT NULL DEFAULT '{}',
  raw            TEXT NOT NULL DEFAULT '',   -- base64 del .xlsx original
  updated_at     TEXT NOT NULL DEFAULT ''
);
```

---

## 9. Generación del Excel

**rowMap:** `{ cod: rowIdx }` — número entero = índice de fila en el xlsx.

```js
for (const cod of Object.keys(T.rowMap)) {
  let totalQty = 0;
  let contado  = false;
  for (const [zoneId, zoneCounts] of Object.entries(S.countsByZone)) {
    if (zoneCounts[cod] === undefined) continue;   // ← !== undefined, no falsy
    const factor = S.presChoiceByZone?.[zoneId]?.[cod]
                ?? T.presMap?.[cod]?.[0]?.factor ?? 1;
    totalQty += zoneCounts[cod] * factor;
    contado = true;
  }
  // Escribir si fue contado explícitamente — cero es dato real ("confirmé que hay 0")
  if (contado) escribirCelda(T.rowMap[cod], T.cantidadColIdx, totalQty);
}
```

El xlsx se regenera desde `T.raw` (base64): se parsea, se sobreescriben las celdas de cantidad y se descarga.

Ítems manuales: no incluir en xlsx. Mostrar en pantalla de validación.

---

## 10. Envío a Google Sheets

POST a `appsScriptUrl` con `mode: 'no-cors'`.

**Si `appsScriptUrl === null`:** no hacer fetch, mostrar "Envío a Sheets no disponible".

Payload — filas por zona (Sheets suma si necesita total):
```js
{
  operario, area: almacen, fecha, timestamp,
  productos: [
    // una fila por (cod × zona) donde fue contado
    { cod, art, cantidad: qty_zona, factorUsado, uni, zona: nombreZona, catalogado: true }
  ],
  manuales: S.manuales
}
```

Si un mismo cod aparece en varias zonas → múltiples filas en Sheets, cada una con su zona y cantidad propia. El total lo calcula Sheets con SUMIF.

---

## 11. Ítems no catalogados (manuales)

- Modal: nombre*, cantidad*, unidad, foto (cámara `capture="environment"`)
- Foto: canvas compress max 800px JPEG 75%
- Se sincronizan al Worker con merge por id
- En pantalla de validación: botón Compartir (Web Share API, fallback clipboard)

---

## 12. Pantallas

```
[welcome]   → logo + dropdown almacenes (alfabético, sin colores)
[session]   → nombre operario + fecha  (plantilla se carga automáticamente del Worker)
[overview]  → zonas con progreso y locks, clic para entrar
[count]     → ítems + búsqueda + qty + badge conversión + selector presentación
               + botón "+ No catalogado"
[generate]  → validación + descarga xlsx + envío Sheets + compartir manuales
```

**Sin pantalla de importación para operarios.** La plantilla viene del Worker o no está disponible.

**Búsqueda:** zona actual → otras zonas (header amarillo) → fuera de zona en plantilla (header verde).
**Badge de conversión:** solo si `factor != 1`.
**Selector presentación:** solo si `presMap[cod].length > 1`.

---

## 13. localStorage keys

| Clave | Contenido |
|---|---|
| `inv_device_id` | ID único del dispositivo |
| `xtux_s_{ALMACEN}` | sesión completa (countsByZone, presChoiceByZone, manuales, …) |

`xtux_t_{ALMACEN}` y `xtux_raw_{ALMACEN}` ya no se usan — la plantilla (incluyendo `raw`) viene del Worker en cada sesión.

---

## 14. Bugs conocidos — corregir antes de operar en producción

Detectados en code review 2026-06-27.

### BUG-1 — Race condition en selectArea() [CRÍTICO]

`selectArea()` tiene 3 awaits (resolveZonas → fetchPlantilla → fetchSesion). Si el usuario presiona ← durante el vuelo, `go('welcome')` ejecuta `ALMACEN = null` síncronamente. Las llamadas pendientes continúan: `lsKey()` produce `xtux_s_null` y `renderAreaWelcome()` se ejecuta encima de la pantalla equivocada.

**Fix:**
```js
async function selectArea(key) {
  ALMACEN = key;
  CFG = AREA_CONFIG[key];
  const savedKey = key;                          // ← capturar al inicio
  // ... awaits ...
  if (ALMACEN !== savedKey) return;              // ← guard antes de cada lsSet
  lsSet('s', S);
  if (ALMACEN !== savedKey) return;              // ← guard antes de renderizar
  renderAreaWelcome();
}
```

### BUG-2 — renderAreaWelcome() apila pantallas [CRÍTICO]

La rama `!T` desactiva todas las pantallas antes de mostrar welcome. La rama normal (T existe, línea ~527) solo hace `classList.add('active')` sin desactivar. `handleFile()` llama `setTimeout(renderAreaWelcome, 1200)` desde screen-import — si el parseo tiene éxito, screen-import y screen-welcome quedan activos simultáneamente (ambos `display:flex`).

**Fix:** mover la deactivación al inicio de la función, antes de cualquier ramificación:
```js
function renderAreaWelcome() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); // ← siempre
  document.getElementById('screen-welcome').classList.add('active');
  // ... resto de la lógica ...
}
```

### BUG-3 — color-mix() sin fallback [CRÍTICO]

`.card`, `.zone-card` y `.area-item` usan `background: color-mix(in srgb, var(--brand-paper) 94%, white)` como único valor. Android WebView <111 (Android 10–12) e iOS <16.2 no soportan `color-mix()` — tarjetas transparentes.

**Fix:** añadir fallback antes de color-mix en cada regla:
```css
.card      { background: var(--brand-paper); background: color-mix(in srgb,var(--brand-paper) 94%,white); ... }
.zone-card { background: var(--brand-paper); background: color-mix(in srgb,var(--brand-paper) 94%,white); ... }
.area-item { background: var(--brand-paper); background: color-mix(in srgb,var(--brand-paper) 94%,white); ... }
```

### BUG-4 — backdrop-filter sin -webkit- en .search-bar y .fab-bar [MEDIA]

`.welcome-hero` tiene `-webkit-backdrop-filter` y `backdrop-filter`. `.search-bar` y `.fab-bar` solo tienen el unprefixed. iOS Safari <15.4 no aplica blur.

**Fix:** añadir `-webkit-backdrop-filter: blur(Xpx)` en ambas reglas CSS.

### BUG-5 — BARRA_AMICI seleccionable sin advertencia [MEDIA]

Aparece como `<option>` normal en el dropdown. El único check de `appsScriptUrl === null` está en `renderValidation()` (última pantalla del flujo). El operario puede completar todo el workflow antes de descubrir que Sheets no está disponible.

**Fix:** deshabilitar la opción en el dropdown:
```js
const options = sorted.map(([key, cfg]) => {
  const disabled = cfg.appsScriptUrl === null ? ' disabled' : '';
  const label = cfg.appsScriptUrl === null ? `${cfg.titulo} (sin configurar)` : cfg.titulo;
  return `<option value="${key}"${disabled}>${label}</option>`;
}).join('');
```

---

## 15. Pendientes — nuevas funcionalidades

### Worker (operaciones-api)
- [ ] Crear tabla `inv_plantillas` en D1
- [ ] Endpoint `GET /inv/plantilla?almacen=X`
- [ ] Endpoint `POST /inv/plantilla` (upsert en inv_plantillas)
- [ ] Deploy

### admin.html
- [ ] Sección "Plantillas Xetux": upload .xlsx por almacén
  - Parsear .xlsx en cliente (misma lógica que inventario.html tenía)
  - POST /inv/plantilla al Worker
  - Mostrar: almacén, fecha de última actualización, hash

### inventario.html
- [ ] Reemplazar lógica de importación local por `fetchPlantilla()` del Worker
- [ ] Quitar pantalla `[import]` y referencias a `xtux_t_*` / `xtux_raw_*`
- [ ] Mostrar aviso si T = null (plantilla no configurada)
- [ ] Corregir bugs 1–5 listados arriba

### Pendientes menores
- [ ] Apps Script URL de BARRA_AMICI (cuando haya catálogo en Xetux)

---

## 15. Lo que NO hace esta app

- No carga a Xetux directamente — xlsx debe importarse manualmente
- No autentica operarios (seguridad por URL no pública, WebAuthn pausado)
- No sincroniza catálogo — tarea del scraper (`sync_d1.py`)
