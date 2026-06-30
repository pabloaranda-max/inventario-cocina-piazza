# inventario.html — Especificación técnica v4.3

> Última actualización: 2026-06-30. Estado: **EN PRODUCCIÓN** (CAVA probado, resto pendiente de plantillas).

---

## 1. Contexto

`inventario.html` reemplaza 6 apps separadas (barra.html, cocina.html, alimentari.html, cava.html, salumeria.html, general.html). Los archivos originales se conservan como backup.

### Estado actual 2026-06-30

**Implementado y deployado:**
- BUG-1 a BUG-5 todos corregidos
- Plantillas centralizadas: admin.html sube → Worker guarda → inventario.html descarga
- `inv_plantillas` en D1: creado y en producción con todas las columnas (ver §8)
- `parsePlantilla` adaptado al formato real de Xetux (ver §5)
- `unitMap`: unidades de la plantilla sobreescriben el catálogo (fix units inconsistentes Xetux)
- `defaultPres`: presentaciones por defecto por unidad (para artículos sin `_NNNN` en Xetux)
- Catálogo filtrado por rowMap: solo aparecen artículos en la plantilla activa
- Catálogos en D1: BARRA(423), COCINA(1106), ALIMENTARI(424), CAVA(214), GENERAL(385), SALUMERIA(74)
- sync_d1.py: sincroniza catálogos Xetux → D1 permanentemente (POST /sync/catalogo con X-Sync-Token)

**CAVA probado:**
- Plantilla: 146 artículos, 131 con presentaciones de Xetux
- unitMap corrige unidades (B.750 → LT para vinos)
- defaultPres configurable desde admin.html (ej: LT → BOTELLA 0.75)
- Artículos sin presentaciones en Xetux reciben defaultPres según su unidad

**Pendiente:**
- Subir plantillas de COCINA, BARRA, ALIMENTARI, GENERAL, SALUMERIA desde admin.html
- Configurar defaultPres para cada almacén que lo necesite
- Corregir unidades del catálogo (gradual — unitMap ya resuelve en el contador)
- BARRA_AMICI: appsScriptUrl aún null (sin catálogo en Xetux)
- CSS muerto sin limpiar (ver §12)

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

**Filtro por rowMap:** `resolveZonas()` filtra los artículos del catálogo por `T.rowMap` — solo muestra los que están en la plantilla activa de Xetux. Si no hay plantilla (T=null), muestra todo.

---

## 3. Arquitectura

```
[inventario.html]
  └─ localStorage (prefijado por almacén)
       xtux_s_{ALMACEN}   → sesión completa (ver §6)
       inv_device_id       → ID único del dispositivo

  └─ Cloudflare Worker: operaciones-api.pablo-aranda.workers.dev
       GET  /articulos?almacen=X            ← catálogo D1 (público)
       GET  /inv/plantilla?almacen=X        ← plantilla Xetux (público)
       POST /inv/plantilla (action: inv_plantilla)   ← solo desde admin.html
       POST /inv/plantilla (action: inv_defaults)    ← solo desde admin.html
       GET  /inv/sesion?almacen=X&fecha=Y
       POST /inv/sesion  (inv_sesion | inv_lock)
       POST /sync/catalogo  ← sync_d1.py con X-Sync-Token

  └─ [admin.html] → gestiona plantillas por almacén
  └─ Google Apps Script (por almacén) → Sheets
```

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

---

## 5. Gestión de plantilla Xetux

### Responsabilidad

- **admin.html** sube la plantilla por almacén (POST /inv/plantilla)
- **admin.html** gestiona `defaultPres` por almacén (POST /inv/plantilla action: inv_defaults)
- **inventario.html** la descarga automáticamente al seleccionar almacén (GET /inv/plantilla)
- No hay pantalla de importación en inventario.html

### Flujo crítico en inventario.html al seleccionar almacén

```
selectArea(key)
  → T = null
  → fetchPlantilla()    ← GET /inv/plantilla?almacen=X
       si 404/vacía → T = null
       si ok → T = { rowMap, cantidadColIdx, presMap, unitMap, defaultPres, templateHash, raw }
  → resolveZonas()      ← GET /articulos?almacen=X y filtra con T.rowMap
  → si sesión activa en Worker → cargarla y mostrar overview
  → si no → mostrar pantalla de nueva sesión
```

**Importante:** `fetchPlantilla()` debe correr antes de `resolveZonas()`. Si se resuelven zonas primero, la app no puede aplicar `rowMap`, `unitMap` ni `defaultPres`; peor aún, podría reutilizar una `T` previa de otro almacén.

### Formato real del archivo Xetux (con "Incluir presentaciones" activado)

```
Col:  0    1       2        3           4        5           6        7
      #    Tipo    Grupo    Subgrupo    Código   Artículo    Unidad   Cantidad
      1    3-VINO  3-1 VINO VINO        MP0553   MONTEPULCI  LT       ''
      1    3-VINO  3-1 VINO ''          MP0553_1160  ---- (P) BOTELLA (0.75 LT)  BOTELLA  ''
```

- Fila artículo: `#` = número, `Subgrupo` = texto, `Código` sin `_NNNN`
- Fila presentación: mismo `#`, `Subgrupo` vacío, `Código` = `PARENTCODE_NNNN`, `Artículo` = `---- (P) NOMBRE (FACTOR UNIDAD)`
- **Factor** se extrae del nombre del artículo: regex `\((\d+\.?\d*)\s+\w+\)\s*$` sobre el campo Artículo
- **cantidadColIdx = 7** (columna Cantidad está en índice 7, no 6 como se asumió antes)

### Reglas de extracción (presMap)

```
R1: factor == 1.0              → ignorar
R2: factor > 10 AND uni ∈ {LT,KG} → ignorar (error Xetux: mL/g)
R3: factor > 1  AND uni == PZA → válido (caja, paquete, bulto)
R4: mismo factor, distintos nombres → deduplicar por valor
R5: múltiples factores válidos → conservar todos → selector en UI
```

### unitMap — unidades de la plantilla (fuente de verdad)

```js
// parsePlantilla retorna unitMap: { cod: unidad }
// inventario.html lo usa para override del catálogo:
uni: (T?.unitMap?.[a.codigo]) || a.unidad
```

Razón: Xetux puede tener unidades incorrectas en el catálogo (ej: CAVA vinos con "B.750" en lugar de "LT"). La plantilla tiene la unidad correcta siempre.

### defaultPres — presentaciones por defecto

```js
// Formato en D1: { "LT": [{ "nombre": "BOTELLA", "factor": 0.75 }] }
// Se aplica cuando presMap[cod] está vacío y unitMap[cod] coincide con una clave
function getPresOptions(cod) {
  const explicit = T?.presMap?.[cod];
  if (explicit?.length) return explicit;
  const uni = T?.unitMap?.[cod] || '';
  return (T?.defaultPres?.[uni]) || [];
}
```

Se guarda con `action: inv_defaults` — **sobrevive re-uploads de plantilla** (columna separada en D1).

Admin configura defaults desde admin.html → sección "Presentaciones por defecto" en tab Plantillas.

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
      id:        'dev_xyz-abc123-r4nd',
      nombre:    'Salsa de la casa',
      cantidad:  2,
      uni:       'LT',
      zona:      'Contra Barra',
      foto:      'data:image/jpeg;base64,...',
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
  "cantidadColIdx": 7,
  "presMap": { "MP0001": [{"nombre":"BOTELLA","factor":0.75}] },
  "unitMap": { "MP0001": "LT" },
  "defaultPres": { "LT": [{"nombre":"BOTELLA","factor":0.75}] },
  "templateHash": "sha256hex...",
  "raw": "base64...",
  "updatedAt": "2026-06-30T02:41:32.075Z" }
```
Response si no: `{ "ok": true, "found": false }`

### POST /inv/plantilla (action: inv_plantilla)

Desde admin.html únicamente. Sin auth requerida.

```json
{ "action": "inv_plantilla", "almacen": "CAVA",
  "rowMap": { "MP0001": 17 }, "cantidadColIdx": 7,
  "presMap": { "MP0001": [{"nombre":"BOTELLA","factor":0.75}] },
  "unitMap": { "MP0001": "LT" },
  "templateHash": "sha256hex...",
  "raw": "base64..." }
```

### POST /inv/plantilla (action: inv_defaults)

Desde admin.html únicamente. No modifica row_map ni raw — solo actualiza default_pres.

```json
{ "action": "inv_defaults", "almacen": "CAVA",
  "defaultPres": { "LT": [{"nombre":"BOTELLA","factor":0.75}] } }
```

Response: `{ "ok": true }`. Error 404 si no existe plantilla para ese almacén (subir primero).

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
// {} entrante = "sin cambios" (no borra)
```

### POST /inv/sesion (action: inv_lock)

```json
{ "action": "inv_lock", "almacen": "CAVA", "fecha": "2026-06-26",
  "zone_idx": 1, "device_id": "dev_x", "operario": "Ana", "release": false }
```

Lock TTL: 30 minutos. Al inicio de cualquier operación de lock, expirar locks viejos.

---

## 8. Esquema D1

### inv_plantillas (en producción)

```sql
CREATE TABLE IF NOT EXISTS inv_plantillas (
  almacen          TEXT PRIMARY KEY,
  row_map          TEXT NOT NULL DEFAULT '{}',   -- {cod: rowIndex}
  cantidad_col_idx INTEGER NOT NULL DEFAULT 7,   -- índice de col Cantidad (7 en Xetux real)
  pres_map         TEXT NOT NULL DEFAULT '{}',   -- {cod: [{nombre, factor}]}
  unit_map         TEXT NOT NULL DEFAULT '{}',   -- {cod: unidad} — override del catálogo
  default_pres     TEXT NOT NULL DEFAULT '{}',   -- {unidad: [{nombre, factor}]} — fallback
  raw              TEXT NOT NULL DEFAULT '',      -- XLSX original en base64
  template_hash    TEXT NOT NULL DEFAULT '',
  updated_at       TEXT NOT NULL DEFAULT ''
);
```

### inv_sesiones (en producción)

```sql
CREATE TABLE IF NOT EXISTS inv_sesiones (
  almacen              TEXT NOT NULL,
  fecha                TEXT NOT NULL,
  operario             TEXT NOT NULL,
  counts               TEXT NOT NULL DEFAULT '{}',   -- legacy (barra.html)
  counts_by_zone       TEXT NOT NULL DEFAULT '{}',
  pres_choice_by_zone  TEXT NOT NULL DEFAULT '{}',
  completed_zones      TEXT NOT NULL DEFAULT '[]',
  locked_zones         TEXT NOT NULL DEFAULT '{}',
  manuales             TEXT NOT NULL DEFAULT '[]',
  template_hash        TEXT NOT NULL DEFAULT '',
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (almacen, fecha)
);
```

---

## 9. Generación del Excel

```js
for (const cod of Object.keys(T.rowMap)) {
  let totalQty = 0;
  let contado  = false;
  for (const [zoneId, zoneCounts] of Object.entries(S.countsByZone)) {
    if (zoneCounts[cod] === undefined) continue;
    const factor = S.presChoiceByZone?.[zoneId]?.[cod]
                ?? T.presMap?.[cod]?.[0]?.factor ?? 1;
    totalQty += zoneCounts[cod] * factor;
    contado = true;
  }
  if (contado) escribirCelda(T.rowMap[cod], T.cantidadColIdx, totalQty);
}
```

El xlsx se regenera desde `T.raw` (base64): se parsea, se sobreescriben las celdas de cantidad y se descarga.

Ítems manuales: no incluir en xlsx. Mostrar en pantalla de validación.

---

## 10. Envío a Google Sheets

POST a `appsScriptUrl` con `mode: 'no-cors'`.

Si `appsScriptUrl === null` → no hacer fetch, mostrar "Envío a Sheets no disponible".

Payload — filas por zona:
```js
{
  operario, area: almacen, fecha, timestamp,
  productos: [
    { cod, art, cantidad: qty_zona, factorUsado, uni, zona: nombreZona, catalogado: true }
  ],
  manuales: S.manuales
}
```

---

## 11. Ítems no catalogados (manuales)

- Modal: nombre*, cantidad*, unidad, foto (cámara `capture="environment"`)
- ID: `${deviceId}-${Date.now().toString(36)}-${random4}`
- Merge en Worker: por id (incoming gana)
- Foto: canvas max 800px, JPEG 75%
- No se escriben al xlsx. Aparecen en resumen de validación y en payload Sheets.

---

## 12. Principios de mantenimiento

> **El spec informa; el test grita.** Toda regla crítica documentada debe tener al menos un fixture ejecutable cuando un bug pueda afectar operación.

No se añade testing por ceremonia — se pone alarma donde ya hubo falla real.

### Plan de estabilización

**Fase 1 — Fixture ejecutable del parser (hacer ya, antes de tocar más código de parser):**
- `tests/fixtures/cava-synthetic.xlsx` — 10-15 filas representativas, sin datos reales de producción
  - artículo LT + presentación BOTELLA 0.75 (caso base)
  - artículo KG + presentación válida
  - artículo PZA + factor 12 (caja — R3 válido)
  - artículo con factor 1.0 → debe ignorarse (R1)
  - artículo LT con factor 1000 → debe ignorarse (R2: mL/g)
  - artículo con dos presentaciones válidas (selector en UI)
  - artículo sin presentación (cae a defaultPres)
- `tests/test-parser.html` — carga SheetJS + `js/plantilla-parser.js`, asserts inline
  - `cantidadColIdx === 7`
  - `rowMap[cod]` existe para cada artículo base
  - `unitMap[cod] === 'LT'` para artículos con unidad LT en la plantilla
  - `presMap[cod]` contiene BOTELLA 0.75 donde aplica
  - artículos con R1/R2 no aparecen en presMap

Nota sobre unitMap: `parsePlantilla` captura la unidad tal como aparece en la plantilla Xetux. El override real ocurre en `resolveZonas()`: si el catálogo D1 dice `B.750` pero `unitMap[cod]` dice `LT`, el ítem muestra `LT`. Eso es un test de integración posterior, no del parser.

**Fase 2 — Alertas Slack en sync_d1.py:**
- Postear a Slack si `articulos_sync == 0` para cualquier almacén
- Postear si la cuenta baja >80% vs la corrida anterior (baseline guardado en archivo local)
- Postear si hay error de login/scrape en Xetux
- Postear si `/sync/catalogo` responde con error
- Resumen normal solo en modo `--verbose` o en el reporte semanal — no generar ruido en cada corrida exitosa

**Fase 3 — Módulos puros (sin bundler, type="module"):**
- `js/plantilla-parser.js` — `parsePlantilla(buffer)`, `hashRaw(raw)`, helpers internos
- `js/sesion-merge.js` — merge de countsByZone, presChoiceByZone, manuales, completedZones; cálculo de totales. **Sin imports DOM/browser** — puede correr en Worker y browser con el mismo archivo.

**Fase 4 — Tests adicionales solo donde duela:**
- Payload Sheets (cálculo de totales por zona con factores)
- Merge Worker (sesion-merge.js cubre ambos lados)

---

## 13. CSS muerto (pendiente limpiar)

`.area-list`, `.area-item`, `.area-item-badge`, `.area-item-info`, `.area-item-name`, `.area-item-sub`, `.area-item-arrow` — del viejo selector en lista.
`.welcome-logo`, `.welcome-sub-title` — del viejo hero oscuro.
`.welcome-logo-text {}` — regla vacía.
`.welcome-hero p { display:none }` — objetivo ya es `<div>`.
