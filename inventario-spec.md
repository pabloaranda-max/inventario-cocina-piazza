# inventario.html — Especificación técnica v4.10

> Última actualización: 2026-07-21. Estado: **EN PRODUCCIÓN** (CAVA probado; BARRA_RESTAURANTE con dos tomas reales completadas).
> v4.10: el export baja el .xlsx directo (zip eliminado — Xetux no lo reconoce) y las
> presentaciones por defecto se guardan todo-o-nada con verificación contra el servidor.
> UH cerró sus 4 almacenes y subió sus plantillas; **la puesta en marcha quedó
> congelada hasta estar en sitio → §15 "R8.1 — Puesta en marcha de UH"**.
> v4.9: scraper ELIMINADO del proyecto (`cargar_xetux.py` apartado en `operaciones/`),
> plan de costeo por restaurante R10a–c (§15).
> v4.8: export con guard verificado + zip por almacén, botón "Cerrar con plantilla
> fresca", apps instalables PWA (§16, UH en repo espejo), icono propio del admin.
>
> **Este documento es el ÚNICO contrato vivo del proyecto.** `plan-slices.md` (v1.0) y
> `FABLE_HANDOFF.md` quedan [SUPERADOS] — sus decisiones vigentes están incorporadas
> aquí (§15). No crear documentos de planeación paralelos; actualizar este.

---

## 0. [SUPERADO] BUGS URGENTES — BARRA_RESTAURANTE (inventario 2026-07-01)

> Resuelto: la toma 2026-07-01 se cerró y cargó (decisión 2026-07-02). El fix
> estructural de zonas es el Slice R5 (§15). Se conserva como registro histórico.

Pablo completó el primer inventario real de BARRA_RESTAURANTE. Funcionó pero con problemas:

### Problemas detectados (detalle pendiente)
- **Plantilla incompleta:** muchos artículos faltaban → tuvo que sumar conteos manualmente para cuadrar
- **Bugs en zonas:** problemas en el flujo de zonas (detalles a confirmar con Pablo)

### Acción requerida (primera prioridad)
1. Completar la toma actual sin modificar las cuatro zonas ya capturadas.
2. `inventario.html` debe complementar las zonas hardcodeadas con una zona adicional `En plantilla` que contiene artículos presentes en la plantilla Xetux pero ausentes de las zonas configuradas.
3. Los artículos capturados en `En plantilla` se suman al export como cualquier otro `countsByZone`; no se borran ni transforman los no catalogados existentes hasta que Pablo los valide.
4. Re-subir plantilla BARRA_RESTAURANTE solo si es indispensable y solo después de confirmar que no rompe el `templateHash` de la sesión a exportar.
5. Verificar que el export del conteo 2026-07-01 salga correctamente.

### Restricción
**No tocar, borrar ni migrar la sesión guardada de BARRA_RESTAURANTE 2026-07-01 hasta que Pablo confirme el export ok.** Cualquier corrección debe ser aditiva: nueva zona `En plantilla`, corrección admin o comentario; nunca reindexar zonas existentes.

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
- ~~sync_d1.py: sincroniza catálogos Xetux → D1~~ ELIMINADO 2026-07-16 junto con el
  scraper; desde R8 el catálogo se deriva de la plantilla al subirla desde admin (§15 R8)

**CAVA probado:**
- Plantilla: 146 artículos, 131 con presentaciones de Xetux
- unitMap corrige unidades (B.750 → LT para vinos)
- defaultPres configurable desde admin.html (ej: LT → BOTELLA 0.75)
- Artículos sin presentaciones en Xetux reciben defaultPres según su unidad

**BARRA_AMICI:** inventario 2026-07-01 completado sin problemas.
**BARRA_RESTAURANTE:** inventario 2026-07-01 completado con workarounds (ver §0).

**Pendiente:**
- Subir plantillas de COCINA, ALIMENTARI, GENERAL, SALUMERIA desde admin.html
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
       GET  /articulos?almacen=X                       ← catálogo D1 (público)
       GET  /inv/plantilla?almacen=X                   ← plantilla Xetux (público)
       POST /inv/plantilla (action: inv_plantilla)     ← solo desde admin.html
       POST /inv/plantilla (action: inv_defaults)      ← solo desde admin.html
       GET  /inv/sesion?almacen=X&fecha=Y              ← incluye exportedAt, exportedBy
       GET  /inv/sesiones[?almacen=X]                  ← listado para admin (v4.5)
       POST /inv/sesion  (inv_sesion | inv_lock)
       POST /inv/sesion  (action: inv_export)          ← marca sesión como exportada (v4.5)
       POST /sync/catalogo  ← [MUERTO 2026-07-16] era sync_d1.py; el catálogo se deriva de la plantilla (R8)

  └─ [admin.html] → gestiona plantillas, muestra sesiones, genera Excel, envía Sheets
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

### Unidades: cada centro escribe las suyas

El Xetux de Piazza usa `LT` y `PZA`; el de Universal de Hamburguesas usa `L` y `PZ`
(`KG` coincide). Nunca comparar contra literales: usar `UNIDAD_PESO_VOLUMEN` /
`UNIDAD_PIEZA` (definidas en admin.html e inventario.html). Con `=== 'LT'` los avisos
de "se mide directo, sin presentación" ignoraban en silencio TODO lo que UH tiene en
litros — justo donde muerde el error de contar piezas y registrar litros.

**Excepción deliberada:** la regla `ml_g` del parser (factor >10 en LT/KG = mL/g mal
capturado, DESCARTA la presentación) **no** se amplió a `L`. UH tiene `BIDON 20 L` y
`BARRIL 29 LT` legítimos que el filtro borraría. Ampliar una regla que solo avisa es
gratis; ampliar una que descarta datos no. Consecuencia asumida: para volúmenes de UH
esa red no existe; para sus `KG` sí.

**defaultPres se indexa por la unidad literal**: una regla para `LT` no aplica a `L`.
Las de UH van con la clave `L`.

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

**El factor default lo aplica el export, no solo la pantalla.** `factorDefault()` en
`js/sesion-merge.js` (Worker + admin) resuelve presMap → defaultPres → 1, y es la única
implementación válida. La pantalla de validación de inventario.html usa `getPresOptions`
por la misma razón: si una superficie mira solo `presMap`, muestra o exporta el conteo
**sin convertir** y el error es silencioso (v4.10 corrigió eso en la validación).

**Guardar defaults es todo-o-nada y verificado (v4.10).** Hasta v4.9 una fila incompleta o
con factor ilegible se descartaba callada y se guardaba `{}` mostrando "✓ Guardado": los
defaults parecían configurados y el export seguía mandando botellas como litros — con
`default_pres = '{}'` en los 8 almacenes de producción al 2026-07-21. Ahora: fila inválida
→ no se guarda nada y se marca la fila; el factor acepta coma decimal (`type=text` +
`inputmode=decimal`, un `type=number` deja `value=""` al teclear `0,75`); guardar vacío
pide confirmación porque BORRA; y tras el POST se relee del servidor y se compara, así que
"✓ Guardado" significa guardado. El editor se oculta si el almacén no tiene plantilla
(antes conservaba las filas del almacén anterior).

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

Si `T.templateHash !== S.templateHash`:

- **inventario.html:** advertencia visible. No bloquear la captura.
- **admin.html al exportar (v4.8):** verificar que TODOS los códigos con conteo
  (countsByZone + correcciones `_admin`) existan en `T.rowMap`. Si todos existen →
  confirm y continuar (los factores default se resuelven con la plantilla vigente).
  Si falta alguno → bloquear listándolos: un código ausente perdería su cantidad en
  silencio al escribir el xlsx. Motivo: re-subir plantilla a mitad de toma es RUTINA
  (Xetux solo acepta importaciones con el nombre de su último export, ver §9), así
  que el mismatch de hash no puede ser un bloqueo duro.

---

## 6. Modelo de sesión

```js
S = {
  operario:          'Juan',
  fecha:             '2026-06-26',
  templateHash:      '1f4a2b-c3d4e5f6',
  countsByZone: {
    // Clave colaborativa: "zoneIdx:deviceId" — cada dispositivo tiene su propia slice
    // myZoneKey(zoneIdx) = `${zoneIdx}:${getDeviceId()}`
    // baseZone(key) = parseInt(key)  ← parseInt se detiene en ':' → extrae zoneIdx
    '0:dev_xyz': { 'MP0001': 3.5, 'XMAT001': 2 },
    '0:dev_abc': { 'MP0001': 1.0 },   // mismo cod, otro dispositivo = se suma al exportar
    '2:dev_xyz': { 'MP0001': 1 }
  },
  presChoiceByZone: {
    '0:dev_xyz': { 'XMAT2409000106': 2.9 },
    '0:dev_abc': { 'XMAT2409000106': 0.75 }  // factor propio por dispositivo
  },
  completedZones: ['0:dev_xyz', '2:dev_xyz'],  // strings "zoneIdx:deviceId"
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

**Conteo colaborativo:** dos o más usuarios pueden contar la misma zona simultáneamente. La clave `"zoneIdx:deviceId"` garantiza que el Worker nunca mezcle conteos de dispositivos distintos. Para claves con ':', el Worker reemplaza la slice completa (permite borrar cantidades); para claves legacy sin ':', sigue haciendo merge superficial. Al exportar el Excel/Sheets, el cliente baja la sesión más reciente del Worker y suma todos los deviceId para cada zoneIdx antes de procesar.

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

### GET /inv/sesiones[?almacen=X&dias=N] (v4.5)

Lista sesiones recientes (default 14 días, max 90). Respuesta:
```json
{
  "ok": true,
  "sesiones": [
    { "almacen": "CAVA", "operario": "Juan", "fecha": "2026-06-26",
      "updatedAt": "2026-06-26T20:00:00Z",
      "exportedAt": "", "exportedBy": "",
      "articulosContados": 131, "zonasCompletadas": 3 }
  ]
}
```
`articulosContados`: códigos únicos en `counts_by_zone`. `zonasCompletadas`: zonas base únicas (parseInt de las claves `"0:dev_abc"`).

### GET /inv/sesion?almacen=X&fecha=Y

Response:
```json
{
  "ok": true, "found": true,
  "operario": "Juan", "fecha": "2026-06-26",
  "templateHash": "1f4a2b",
  "countsByZone": { "0:dev_abc": { "MP001": 2 } },
  "presChoiceByZone": { "0:dev_abc": { "XMAT001": 0.75 } },
  "completedZones": ["0:dev_abc"],
  "lockedZones": { "1": { "device_id": "dev_x", "operario": "Ana", "ts": "..." } },
  "manuales": [],
  "exportedAt": "", "exportedBy": "",
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

### POST /inv/sesion (action: inv_export) (v4.5)

```json
{ "action": "inv_export", "almacen": "CAVA", "fecha": "2026-06-26",
  "operario": "Javier", "adminPassword": "***", "force": false }
```

- Requiere password admin. En Worker se valida contra `INV_ADMIN_PASSWORD` si existe; si no, usa el password admin legacy.
- Si ya fue exportada y `force: false` → 409 `{ ok: false, error: "Ya exportada", exportedAt, exportedBy }`
- Si `force: true` → sobrescribe `exported_at` y `exported_by`
- Éxito → `{ ok: true }`

Solo admin.html debe llamar este endpoint. Se llama después de generar XLSX y enviar a Sheets; no antes.

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
  original_filename TEXT NOT NULL DEFAULT '',    -- nombre del archivo exportado por Xetux (v4.7, migración 0003)
  template_hash    TEXT NOT NULL DEFAULT '',
  updated_at       TEXT NOT NULL DEFAULT ''
);
```

`original_filename` se captura de `file.name` al subir la plantilla en admin.html y se
usa como nombre del XLSX exportado (Xetux puede rechazar archivos renombrados — ver §9).
Plantillas subidas antes de v4.7 lo tienen vacío → el export cae al nombre legacy
`Inventario_{almacen}_{fecha}.xlsx` hasta que se re-suba la plantilla.

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
  exported_at          TEXT NOT NULL DEFAULT '',
  exported_by          TEXT NOT NULL DEFAULT '',
  updated_at           TEXT NOT NULL,
  PRIMARY KEY (almacen, fecha)
);
```

---

## 9. Generación del Excel

La exportación oficial vive en `admin.html`. `inventario.html` solo captura, sincroniza y muestra un resumen de toma; no debe descargar XLSX ni enviar a Google Sheets desde dispositivos de conteo.

Flujo:

```
admin.html
  → GET /inv/sesiones?dias=30
  → seleccionar almacen+fecha
  → GET /inv/sesion?almacen=X&fecha=Y
  → GET /inv/plantilla?almacen=X
  → generar XLSX desde T.raw
  → POST Apps Script del almacén
  → POST /inv/sesion action=inv_export  ← marca export oficial
```

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

El xlsx se regenera desde `T.raw` (base64): se parsea, se sobreescriben las celdas de cantidad y se descarga desde admin.

**Nombre del archivo (v4.7):** el archivo descargado usa `T.originalFilename` (el nombre
exacto con que Xetux exportó la plantilla); solo si está vacío cae al nombre legacy
`Inventario_{almacen}_{fecha}.xlsx`. Motivo: Xetux puede bloquear la importación por
nombre de archivo antes de validar contenido. **Además, el nombre válido nace al CREAR
la toma de inventario en Xetux** (consecutivo XTINVxxxxxx): exportar plantilla e importar
la carga masiva van siempre pegados a esa toma.

**Descarga: .xlsx directo (v4.10 — revierte el zip de v4.8).** El zip de v4.8 (`buildZip`,
carpeta `ALMACEN/`) está ELIMINADO: **Xetux no reconoce el zip**, obligaba a descomprimir a
mano en cada carga y no aportaba nada. No reintroducir empaquetado sobre el archivo que va
a Xetux — lo que Xetux valida es el nombre del .xlsx.

**Modal "Inventario listo" (v4.10).** El export ya no baja el archivo solo: `construirXlsx
Inventario()` devuelve `{bytes, fname}` y el modal `#modal-archivo` muestra almacén, fecha y
el **nombre exacto con botón de copiar** (para pegarlo en el diálogo de importación de
Xetux, donde los `XTINVxxxxxx` son indistinguibles entre sí). Guardar es un clic propio:

- Con `showSaveFilePicker` (Chrome de escritorio) el archivo **se sobrescribe** y Chrome
  recuerda la carpeta por almacén vía la opción `id: 'inv_<almacen>'`. Esto es lo que
  elimina el ritual de borrar-antes-de-bajar: una descarga normal NO sobrescribe, Chrome
  crea `… (1).xlsx` y **Xetux rechaza ese nombre**.
- Sin soporte, o si el picker falla por cualquier motivo que no sea `AbortError`, cae a
  `<a download>` y avisa de la trampa del `(1)`.
- Si el usuario renombra en el diálogo, se compara `handle.name` con `fname` y se avisa.

**Por qué guardar va en un clic aparte y no automático:** `showSaveFilePicker` exige gesto
de usuario reciente (~5 s) y el export tarda más que eso (fetches de sesión/plantilla +
`XLSX.write` con estilos + los confirm del guard). Llamarlo dentro del flujo daría
`SecurityError` y caería siempre al `<a download>` — justo lo que hay que evitar.

**Botón "Nombre del archivo"** en cada toma ya exportada (`verArchivoDeToma`): pide la
plantilla vigente y abre el mismo modal en modo solo-nombre, para identificar cuál de los
archivos acumulados en la carpeta corresponde a esa toma.

**Botón "Cerrar con plantilla fresca" (v4.8, tab Tomas, solo sesiones pendientes):**
colapsa el ciclo semanal en un paso — se elige el xlsx recién exportado de Xetux y el
admin: (1) valida que todo lo contado exista en él ANTES de subir nada (si falta un
código, aborta listándolo), (2) lo sube como plantilla del almacén (action
inv_plantilla), (3) dispara el export normal con `opts.hashVerificado` (el guard de §5
no re-pregunta). Flujo semanal completo: crear toma en Xetux → exportar plantilla →
botón → importar el .xlsx descargado en Xetux.

**Diagnóstico de importación — método empírico, no especulativo:** si Xetux rechaza un
archivo generado por la app, la única fuente de verdad es el error real de Xetux en un
intento de importación. No "blindar" el archivo contra causas hipotéticas (metadata,
hashes, encoding, etc.) sin un rechazo observado que lo justifique. El export ya
preserva libro, hoja, formato y estructura al regenerar desde `T.raw` con `cellStyles`.

Ítems manuales: no incluir en xlsx. Mostrar en pantalla de validación.

---

## 10. Envío a Google Sheets

POST a `appsScriptUrl` con `mode: 'no-cors'` desde `admin.html`.

Regla operativa: varios dispositivos pueden capturar simultáneamente, pero solo admin hace el cierre oficial. Esto evita que dos teléfonos creen dos hojas de detalle con los mismos totales combinados.

Si `appsScriptUrl === null` → no hacer fetch, mostrar "Envío a Sheets no disponible".

Payload — filas por zona:
```js
{
  operario, exportadoPor, area: almacen, fecha, timestamp,
  productos: [
    { codigo, nombre, unidad, cantidad, cod, art, uni, catalogado: true }
  ],
  manuales
}
```

---

## 10.1 Estado de exportación en Worker

`inv_sesiones` conserva el estado de cierre:

```sql
exported_at TEXT NOT NULL DEFAULT '',
exported_by TEXT NOT NULL DEFAULT ''
```

`POST /inv/sesion` con `action: inv_export`:

```json
{ "action": "inv_export", "almacen": "CAVA", "fecha": "2026-06-30",
  "operario": "Javier", "adminPassword": "***", "force": false }
```

Si ya está exportada y `force` no es true, responde 409. `admin.html` permite re-exportar explícitamente. `exported_at` se considera cierre administrativo, no reserva previa.

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

**Fase 2 — ~~Alertas Slack en sync_d1.py~~ [OBSOLETO 2026-07-16: scraper y sync_d1.py eliminados del proyecto]:**
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

---

## 14. Preparación editable de conteo — IMPLEMENTADO (R5, 2026-07-08)

> Implementado tal como se describe abajo. Notas de la implementación real:
> - Editor: admin.html tab **Preparación** (borrador / guardar y activar / desactivar).
>   Desactivar regresa el almacén al comportamiento legacy (AREA_CONFIG o catálogo).
> - El snapshot se persiste en `inv_sesiones.zone_snapshot` (migración 0005,
>   first-write-wins): un segundo dispositivo que continúa la toma hereda las
>   MISMAS zonas aunque el admin edite la preparación a media toma (E2E verificado).
> - Los artículos inactivos/no asignados aparecen al buscar bajo
>   "Fuera de zona · en plantilla" y se pueden capturar (mecanismo previo, reusado).
> - ⚠️ Edge conocido: "Nueva toma" el MISMO día sobre el mismo almacén reusa la fila
>   D1 (PK almacen+fecha) y conserva el snapshot original por first-write-wins. Para
>   un reset real ese día: borrar la sesión desde admin y luego iniciar la nueva.
> - Vista reducida de Cocina: mismo mecanismo (pocos activos). Falta configurar la
>   preparación real (~60 proteínas) cuando se suba la plantilla COCINA.

Objetivo: eliminar zonas hardcodeadas y permitir que admin prepare cada toma sin volver frágil la operación.

### Principio

La plantilla Xetux es la fuente total de artículos. La preparación de conteo define cómo se presentan esos artículos por almacén:

- zonas editables desde `admin.html`
- artículos activos/inactivos por zona
- orden editable por zona
- un artículo puede existir en una o varias zonas
- búsqueda global sobre toda la plantilla
- sesiones existentes nunca cambian cuando se edita una preparación futura

### Experiencia recomendada

No usar bloqueo duro para artículos inactivos. En operación real genera más no catalogados.

Comportamiento deseado:

- Artículo activo en zona: aparece normalmente.
- Artículo en plantilla pero no activo en la zona: aparece al buscar bajo `En plantilla · no asignado a esta zona`.
- El operario puede capturarlo, pero queda marcado como fuera de zona.
- Admin puede revisar esos casos después y decidir si el artículo debe activarse en esa zona para futuras tomas.

### Modelo propuesto D1

```sql
CREATE TABLE IF NOT EXISTS inv_zone_configs (
  id            TEXT PRIMARY KEY,
  almacen       TEXT NOT NULL,
  template_hash TEXT NOT NULL DEFAULT '',
  zones_json    TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

`zones_json`:

```json
[
  {
    "id": "almacen_barra",
    "nombre": "Almacén Barra",
    "color": "#667eea",
    "items": [
      { "cod": "XMAT...", "orden": 10, "activo": true },
      { "cod": "MP...", "orden": 20, "activo": false }
    ]
  }
]
```

### Snapshot de sesión

Al iniciar una toma, la app debe guardar el snapshot de preparación usado:

```js
S = {
  zoneConfigId: 'cfg_...',
  templateHash: '...',
  zoneSnapshot: [ /* zonas, orden y activos al iniciar */ ],
  countsByZone: {}
}
```

Regla crítica: `inventario.html` renderiza una sesión existente desde `S.zoneSnapshot`, no desde la preparación activa actual. Así, cambiar la preparación mañana no altera una toma abierta o ya exportada.

### Endpoints propuestos

```
GET  /inv/zone-config?almacen=X
POST /inv/zone-config          action=inv_zone_config_save
POST /inv/zone-config          action=inv_zone_config_activate
```

Guardar/activar debe requerir password admin.

### Migración gradual

1. Mantener el rescate actual con zona automática `En plantilla` para hardcodeados.
2. Crear editor de preparación en `admin.html`.
3. Guardar configs en D1 sin que `inventario.html` las use todavía.
4. Agregar snapshot al crear sesión nueva.
5. Hacer que `inventario.html` use `zoneSnapshot` si existe.
6. Migrar BARRA_RESTAURANTE fuera de `AREA_CONFIG.zonas`.
7. Eliminar hardcode cuando haya al menos una toma completa verificada con preparación editable.

---

## 15. PLAN — Slices v2 (2026-07-08)

> Sustituye a `plan-slices.md` v1.0. Reordenado por dolor operativo real (tomas de
> julio 2026), no por higiene técnica. Slice 0 del plan v1 (seguridad: password rotado,
> fallback eliminado, staging Worker, PATs, crons scraper pausados, worker legacy
> borrado) quedó COMPLETO.

### Contexto operativo (resumen del handoff 2026-07-08)

- 7 almacenes: General, Cocina, Cava, Barra Restaurante, Barra Amichi, Alimentari,
  Salumería. Son nodos de una red (cualquiera puede transferir a cualquiera), no islas.
- La app es capa de captura/validación/consolidación para Xetux; no lo reemplaza.
- Human in the loop mientras los datos estén sucios: detectar y marcar, no autocorregir.
- Cocina cuenta ~60 ítems (proteínas) pero su plantilla trae ~700+ que deben seguir
  activos en Xetux → vista operativa reducida + catálogo consultable (cubierto por R5).
- Cava: usuarios no expertos fallan buscando etiquetas italianas → buscador tolerante
  (futuro; no bloquea slices actuales).
- Visión futura (NO slices): voz, código de barras, API Xetux, cámaras, básculas,
  inventario diario en barras, replicabilidad Tuétano.

### Orden de ejecución

| # | Slice | Estado |
|---|---|---|
| R2 | **Nombre de archivo Xetux** — capturar `file.name` al subir plantilla (columna `original_filename`, migración 0003), usarlo en la descarga del export | HECHO 2026-07-08 (prod; plantillas viejas usan nombre legacy hasta re-subirse) |
| R1 | **Continuidad de toma** — sin sesión local, `selectArea()` consulta `GET /inv/sesiones` (7 días), filtra no-exportadas con conteos y ofrece "Continuar esta toma" cargándola con su fecha original. Con sesión local el flujo no cambia. `inventario-beta.html` creado (= inventario.html apuntando a staging, banner visible) | HECHO 2026-07-08 (E2E Playwright en staging: dispositivo limpio ve y continúa toma de otro día sin crear fila nueva) |
| R3 | **Auth endpoints admin** — header `X-Admin-Password` obligatorio en `inv_plantilla` e `inv_defaults`; acción nueva `inv_admin_check` valida el login de admin.html contra el Worker. **El password ya NO está hardcodeado en admin.html** — rotar es solo `wrangler secret put INV_ADMIN_PASSWORD` (⚠️ pendiente: Pablo debe rotarlo, el valor viejo quedó en el historial público de git). `inv_sesion`/`inv_lock` sin auth a propósito | HECHO 2026-07-08 (matriz 401/200 en staging y prod; login E2E Playwright) |
| R4 | **Módulos puros + tests** — `js/plantilla-parser.js` (admin lo expone en window) y `js/sesion-merge.js` (compartido Worker+admin: merge de sesiones y totales con factor). `tests/test-parser.html` (15 asserts, fixture `cava-synthetic.xlsx`), `tests/test-merge.mjs` (12 asserts, correr con node). inventario.html aún tiene su lógica interna de render — unificarla queda para R5 | HECHO 2026-07-08 (tests verdes; upload E2E staging; merge verificado en staging y prod) |
| R5 | **Preparación editable de conteo** — §14 completo + vista reducida de Cocina (mismo mecanismo: `items[].activo` por zona). Fusiona Slice 4 v1 + Prioridad F del handoff | HECHO 2026-07-08 (migraciones 0004/0005; tab Preparación en admin; `zoneSnapshot` congelado por sesión, first-write-wins en D1; E2E staging: editor 13 asserts, snapshot 11, vista reducida 7. La preparación REAL de COCINA queda pendiente de que se suba su plantilla) |
| R5.1 | **Atribución por operario** — el Worker acumula `{deviceId: {operario, at}}` en `inv_sesiones.operarios_by_device` (migración 0006) a partir de las claves `zona:deviceId` de cada sync; admin muestra "quién capturó qué" (columna Operario en detalle por zona + resumen). Worker-only: los teléfonos no necesitan recargar. Limitación: un dispositivo se atribuye cuando sincroniza DESPUÉS del deploy; los nombres de syncs previos solo quedan en locks (expiran) y correcciones | HECHO 2026-07-08 (staging: 2 dispositivos simulados, re-sync no pisa; prod desplegado a media toma COCINA, atribución en curso) |
| R6 | **Reporte de presentaciones sospechosas** — detección en admin (duplicadas, repetidas, factores sospechosos); marca y pide decisión humana, nunca autocorrige | HECHO 2026-07-08. `parsePlantilla` reporta `sospechosas[]` (factor_1, ml_g, duplicada, factor_ilegible, nombre_ambiguo) además de filtrar; admin tab Plantillas muestra "Revisión de presentaciones" calculada al vuelo desde `raw` (+ LT/KG sin presentación ni default, listas capadas a 60). Sin Worker ni migraciones. Tests parser 19/19; E2E staging 8 asserts. En prod detecta mugre real: COCINA 104×factor_1, 3×ml_g, 2×ilegible; CAVA 44×duplicada |
| R7 | **Admins restringidos por almacén** — tabla `inv_admins` (nombre, password_hash, almacenes permitidos); solo el password maestro (`INV_ADMIN_PASSWORD`) crea/edita perfiles; el Worker valida el almacén en cada ACCIÓN de admin (exportar, borrar, plantillas, preparaciones) y admin.html filtra la vista. ⚠️ Alcance honesto: restringe acciones y UI, no lectura de datos — los GET de sesiones son públicos a propósito (operarios sin credencial); cerrar lecturas implicaría autenticar operarios (proyecto aparte) | HECHO 2026-07-08 (migración 0007; `invAdminAuth` en Worker: maestro por password, perfil por nombre+password vía `X-Admin-User`/`adminUser`; acciones nuevas `inv_admin_list/save/delete` solo maestro; `inv_export`/`inv_delete` migrados al mismo auth con validación de almacén; admin.html: tab 👥 Admins solo maestro, chips/selects/sesiones/tomas filtrados por perfil, no se fetchean Apps Scripts de almacenes ajenos. Matriz curl staging 32/32; E2E Playwright staging 11/11. Compat: admin.html viejo + Worker nuevo sigue funcionando con el maestro). **EN PROD 2026-07-09:** migración 0007 aplicada en prod (backup `~/backups/operaciones-db-backup-2026-07-09-r7.sql`), Worker desplegado, merge a main publicado en Pages; verificado en prod: `inv_admin_list` sin/con password malo → 401 "Sin permiso", GETs de operario siguen 200. Falta crear perfiles reales desde tab 👥 Admins (solo Pablo, password maestro) |
| R8.1 | **Puesta en marcha de UH en sitio** — defaults de presentación, zonas, Sheet del centro y perfil de admin. **Ver §15 "R8.1 — Puesta en marcha de UH"** | PENDIENTE — congelado a propósito 2026-07-21 hasta estar en el sitio de Universal. La infraestructura ya está lista (4 almacenes, 4 plantillas en D1, catálogos derivados); lo que falta requiere ver los almacenes físicos |
| R8 | **Multi-centro — "Universal de Hamburguesas"** — segundo centro de consumo. Almacenes CONFIRMADOS por UH 2026-07-21: `UH_MERCH`, `UH_COCINA`, `UH_BARRA`, `UH_SUMINISTROS` (el `UH_GENERAL` de R8 era provisional y se retiró sin migración — nunca tuvo plantilla, catálogo ni tomas en D1). Ver diseño abajo | HECHO 2026-07-10 (E2E staging: 9 asserts API — catálogo derivado, no-pisar, aislamiento CAVA — + 13 asserts navegador — filtro por centro, banner, guardia cross-centro, normalización del param, beta UH_COCINA 8 arts desde staging. Sin migraciones D1. PENDIENTE: Apps Script UH bloqueado en `clasp login` de Pablo; plantillas reales UH cuando existan en su Xetux). **EN PROD 2026-07-10:** Worker desplegado (smoke test GETs OK), merge a main publicado en Pages. URL operarios UH: `inventario.html?centro=UH` |
| R9a | **Tomas desde D1 + UI centro→almacén + limpieza visual** — el tab Tomas de admin.html deja de consultar Apps Scripts y lee `GET /inv/sesiones` del Worker; filtros de dos niveles (centro → almacén); limpieza de emojis. Ver diseño abajo | HECHO 2026-07-12 (E2E staging 27 asserts Playwright: lista D1 con operarios R5.1/manuales/comentarios, matriz centro→almacén, detalle, PDF por centro desde `calcularTotalesSesion`, CERO requests a script.google.com; histórico Sheets on-demand solo lectura; modal notas Sheets eliminado — el detalle D1 ya cubría notas/correcciones. Worker: GET extendido con manuales/comentarios/operarios, sin migración. **EN PROD 2026-07-12:** Worker desplegado (smoke: 3 sesiones prod con campos nuevos), merge a main en Pages) |
| R9b | **Sheets de excepciones, un script por centro** — `scripts/centro/Code.js` único (deploy Pasticcio + UH); a Sheets solo viajan manuales + fotos + artículos con observación; sin pestañas de detalle. Requiere R9a. Ver diseño abajo | HECHO — **EN PROD 2026-07-13**. Script Piazza desplegado (proyecto `1hFie_…AaRs`, deployment `AKfycby7…wU9S`, libro `Inventario Excepciones · Piazza Pasticcio` = `1Xz7O10p…HFAg`); prueba real: 2 filas de excepciones en MAESTRA (observación resaltada + manual con foto en Drive y miniatura inline), cero pestañas de detalle. Cambios vs diseño: el filtro de payload vive en admin.html (`exportarSesionInventario`) porque inventario.html ya no enviaba a Sheets desde R9a — su config `appsScriptUrl` era código muerto y se eliminó; los 6 scripts viejos quedan como `SHEETS_LEGACY_PIAZZA` SOLO para "Cargar histórico"; BARRA_AMICI ahora sí envía excepciones (antes no tenía Sheets). El script re-filtra defensivamente por si llama un cliente viejo. **UH pendiente:** `clasp create` segundo proyecto con el mismo Code.js + `setupUH()` + deploy → URL a `SCRIPT_CENTRO.UH` |
| R10a | **Piloto de costeo manual (compuerta go/no-go)** — un mes: 4 XLS exportados a mano de Xetux + tomas D1 → costo real por almacén/centro, auditoría de costos $0, cobertura ABC del conteo. Cero código permanente. Ver diseño abajo | PENDIENTE (arranca cuando Pablo baje los 4 XLS del mes piloto) |
| R10b | **Tab Costos en admin — carga manual de archivos** — SOLO con el go de R10a. Arrastrar los 4 XLS al tab (patrón subida de plantillas), tablas D1 con `centro`, `GET /costos/resumen`, reporte semanal/mensual de dos capas. Ver diseño abajo | CONDICIONADO al go de R10a |
| R10c | **Brecha real (mermas + desperdicio)** — costo real (R10b) − costo teórico (recetas/consumo Xetux). Cierra el rediseño de reportes pendiente desde 2026-03-27 | FUTURO (tras R10b estable) |
| — | Limpieza (CSS muerto §13, mover apps viejas a `legacy/`, chat GROQ) — oportunista, al colarse en otra sesión | OPORTUNISTA |
| — | Sheets API en vez de Apps Script (4b v1) — solo si Apps Script falla en un cierre real | FUTURO |

### R8 — Multi-centro (diseño, 2026-07-10)

Contexto: los 7 almacenes actuales pertenecen al centro de consumo **Piazza
Pasticcio**. Se agrega el centro **Universal de Hamburguesas** (Xetux DISTINTO
pero flujos idénticos: exportar plantilla xlsx / importar xlsx de carga masiva —
la app solo ve archivos, nunca habla con Xetux, así que hoy no cambia nada del
flujo). Decisión: misma app, mismo Worker, misma D1 — NO app ni instancia aparte.

- **`centro` explícito en AREA_CONFIG** (`'PIAZZA'` los 7 existentes, `'UH'` los
  nuevos), pensado para que la futura API Xetux se conecte POR CENTRO (secrets
  `XETUX_*_PIAZZA` / `XETUX_*_UH` en el Worker, resolución almacén → centro →
  credenciales). No hay columna nueva en D1: los IDs `UH_*` son únicos y todas
  las tablas ya van por almacén.
- **URL de entrada por centro:** `inventario.html?centro=UH` fija el centro,
  muestra SOLO sus almacenes y un banner con el nombre del centro siempre
  visible. Sin parámetro = PIAZZA (cero regresión para bookmarks existentes).
  Es guardia de UI, no auth (mismo alcance honesto que R7): evita el error de
  dedo de contar la COCINA de Piazza siendo operario de Universal.
- **Catálogo derivado de plantilla:** `parsePlantilla` devuelve además
  `articulos[]` (código, nombre, grupo, subgrupo, unidad — la plantilla trae
  todo); admin los incluye en el POST `inv_plantilla` y el Worker los upserta en
  `catalogo_articulos` SOLO si el almacén no tiene catálogo (COUNT=0). Los
  catálogos Piazza (sembrados por sync_d1.py, hoy eliminado) no se tocan. Alta de almacén nuevo
  queda 100% self-service: subir plantilla → catálogo + rowMap + unitMap listos.
- **Sheets propios de Universal:** UN solo Apps Script + UN Spreadsheet para
  todo el centro (la columna `Almacén` de MAESTRA ya distingue; menos deploys y
  una sola autorización). Los `UH_*` comparten `appsScriptUrl`; arrancan con
  `null` si el Sheet aún no existe. Fuente: `scripts/centro/` desde R9b
  (`scripts/universal/` quedó SUPERADO), deploy con clasp.
- **Permisos:** cero cambios — R7 ya restringe por lista de almacenes; un perfil
  de Universal lleva `UH_*`.
- **admin.html:** agregar `UH_*` a `ALMACENES` con agrupación visual por centro.

Done de R8: en staging, subir plantilla a un almacén `UH_*` desde admin (catálogo
derivado verificado), contar en `inventario-beta.html?centro=UH` sin ver almacenes
Piazza, export xlsx correcto; E2E verde; Piazza sin regresión (home sin parámetro
idéntico al actual).

### R8.1 — Puesta en marcha de UH: PENDIENTE HASTA ESTAR EN SITIO

> **Congelado a propósito el 2026-07-21.** Lo que falta no se puede decidir desde
> la computadora: hay que ver los almacenes de Universal, cómo están acomodados y
> en qué presentación llega cada cosa. Retomar ESTA sección al llegar al sitio.

**Lo que YA está listo y no hay que volver a hacer:**

- Los 4 almacenes existen en las apps: `UH_MERCH`, `UH_COCINA`, `UH_BARRA`,
  `UH_SUMINISTROS`.
- Las 4 plantillas están en D1 con su nombre de Xetux, y los catálogos se
  derivaron solos: Merch 8 artículos, Cocina 122, Barra 51, Suministros 12.
- El parser leyó las 35 presentaciones de Xetux **sin descartar ninguna**.
- Los operarios entran por `inventario.html?centro=UH`.

**Paso 1 — Presentaciones por defecto (tab Plantillas, por almacén).**
Merch y Suministros son 100% PZ: no requieren nada. En Cocina y Barra hay 115
artículos en KG/L sin presentación, pero la mayoría es correcta así:

- **Las `SUB *` son subrecetas** producidas en casa (26 en Cocina, 5 en Barra).
  Se pesan o miden en su recipiente: NO llevan presentación de proveedor.
- **Lo que se pesa a granel** (verduras, carnes, especias, sal, azúcar) tampoco.
- **El riesgo real es lo que llega en empaque cerrado y alguien va a contar por
  bulto.** Candidatos a revisar en sitio:
  - *Cocina:* MAYONESA HEINZ POUCH · MAYONESA KRAFT · MAYONESA MCORMICK ·
    MOSTAZA FRENCHS SPICY BROWN · CHILE JALAPEÑO EN LATA · JALAPEÑO ENCURTIDO ·
    PEPINILLOS REBANADOS · PANKO BIMBO · SALSA BUFFALO · SALSA SWEET CHILLI MAE
    PLOY · MIEL DE ABEJA · LECHE DESCREMADA EN POLVO · QUESO CHEDDAR KIRKLAND ·
    QUESO PEPPERJACK WOOLSHURT · SUERO DE LECHE · VINAGRE DE VINO BLANCO ·
    LECHE ENTERA (L) · VINAGRE DE VINO TINTO COLAVITA (L)
  - *Barra:* BASE PARA HELADO CAPRI · CREMA DE AVELLANA · CREMA DE PISTACHE ·
    GALLETA MOLIDA LOTUS · TOPPING BISCOFF · DEXTROSA · LECHE DESCREMADA EN
    POLVO · MIEL DE ABEJA · ESENCIA DE VAINILLA (L) · LECHE ENTERA (L)

  La lista viva y completa la da el panel "Revisión de presentaciones" del tab
  Plantillas. Dos avisos: `defaultPres` se indexa por la unidad literal, así que
  **las reglas de UH van con clave `L`, no `LT`**; y un default por unidad aplica
  a TODO lo que no tenga presentación propia en esa unidad — si solo algunos
  artículos la necesitan, la corrección va en Xetux, no en el default.

**Paso 2 — Preparación de conteo (tab Preparación, por almacén).** Sin zonas,
Cocina se cuenta como una lista de 122 artículos. Definir las zonas en sitio
según cómo esté acomodado físicamente el almacén, con el orden en que se camina.

**Paso 3 — Sheet de excepciones del centro.** `SCRIPT_CENTRO.UH` ya está
desplegado; falta ejecutar `setupUH()` una vez para crear Spreadsheet y carpeta
de fotos. Sin esto las excepciones (manuales con foto, observaciones) no tienen
a dónde llegar — el conteo oficial no se ve afectado, va por el XLSX.

**Paso 4 — Perfil de admin de UH (R7).** Crear un perfil restringido a `UH_*`
desde el tab Admins (solo con el password maestro) para que quien opere Universal
no vea ni toque los almacenes de Piazza.

**Trampa conocida (ya resuelta, no re-introducir):** el Xetux de UH escribe `L` y
`PZ` donde el de Piazza escribe `LT` y `PZA`. Ver §5 "Unidades: cada centro
escribe las suyas" — incluida la razón por la que la regla `ml_g` NO se amplió a
`L` (`BIDON 20 L` y `BARRIL 29 LT` son legítimos).

### R9 — Archivo v2: tomas desde D1 + Sheets de excepciones (diseño, 2026-07-12)

**Contexto y decisiones (sesión 2026-07-12):**

- D1 prod medido 2026-07-12: **0.94 MB totales** (4 sesiones, 7 plantillas, 2,605
  artículos). Free tier Cloudflare: 500 MB/base, 5 GB/cuenta, 5M lecturas/día,
  100K escrituras/día → **capacidad NO es argumento para conservar Sheets**;
  proyección ~12 MB/año en el peor caso.
- Reparto de registros sin traslape: **Xetux** = registro oficial de catalogados
  (vía export/import validado); **D1** = registro operativo completo (quién,
  cuándo, por zona, correcciones); **Sheets** = SOLO libro de excepciones legible
  para humanos sin admin: **manuales + fotos + artículos con observación** —
  nada de eso llega a Xetux (la carga masiva solo lleva Cantidad), por lo que
  esta parte de Sheets es la única irreemplazable.
- Las pestañas de detalle por envío (`AREA_YYYYMMDD_HHMM`) son duplicado 100% de
  MAESTRA (solo aportan la miniatura) y crecen sin tope → se eliminan; la
  miniatura cabe en MAESTRA porque las filas de excepción son pocas.
- **Un Apps Script + un Spreadsheet POR CENTRO** (Pasticcio migra de sus 6
  scripts por almacén; Universal nace ya así). Sheets/scripts viejos de Piazza
  quedan CONGELADOS como histórico — no se borran ni se migran datos.
- Emojis en admin: se ven poco profesionales (feedback de Pablo). Decorativos
  fuera; estados → badges de color; SVG inline solo si es imprescindible.
- Futuro (decisión abierta, NO slice): la "ventana humana" podría terminar
  siendo una página de solo-lectura en Pages sobre los GETs públicos del Worker;
  Sheets de excepciones cubre ese rol mientras tanto a costo $0.

**R9a — Tomas desde D1 + UI centro→almacén + limpieza visual (admin.html):**

- `cargarTodasLasTomas()` deja el fan-out a Apps Scripts; lee `GET /inv/sesiones`
  (público por diseño R7). Verificar que la respuesta cubre el listado (fecha,
  operario/s, almacén, nº ítems, exported, timestamp); si falta campo o rango de
  fechas, extender el GET (Worker, sin migración D1).
- Detalle de toma y PDF: reconstruir desde la sesión D1 (countsByZone +
  zoneSnapshot), totales con `js/sesion-merge.js` (mismo módulo que el Worker —
  cierra de paso el pendiente vivo de R5).
- Filtros de dos niveles: selector de centro (Todos / Piazza / Universal) +
  chips de almacén filtradas por el centro elegido. Muere el chip especial `UH`
  con startsWith.
- Borrar toma = `inv_delete` (R7, ya existe). El borrado vía Apps Script deja de
  ofrecerse (Sheets pasa a histórico congelado).
- Limpieza visual: tabs sin emoji (texto tipografiado); ✅/❌/⚠️ → badges de
  color ya estilados; "📄 PDF" → "PDF"; 📦 contadores → texto; chip Universal
  sin 🍔 (monocromo #111827, coherente con branding R8). inventario.html solo
  oportunista.
- **Alcance honesto:** el listado D1 solo cubre tomas desde que existe
  `inv_sesiones`; tomas anteriores viven en los Sheets congelados (dejar link
  "ver históricos" al Spreadsheet, no fetch).
- **Done R9a:** tab Tomas funciona SIN ningún Apps Script configurado (UH lista
  sus tomas sin script); mismas tomas visibles que antes para Piazza reciente;
  matriz de filtros centro→almacén verificada; PDF de una toma real idéntico en
  contenido al actual; cero emojis decorativos en admin.

**R9b — Sheets de excepciones, un script por centro (requiere R9a):**

- Nuevo `scripts/centro/Code.js` ÚNICO para ambos centros (2 deployments;
  Script Properties: SPREADSHEET_ID, DRIVE_FOLDER_ID, CENTRO). Sustituye a
  `scripts/universal/` y a los 6 de Piazza.
- `procesarInventario` v2: recibe SOLO excepciones; escribe MAESTRA (con
  miniatura inline) + NOTAS; NO crea pestañas de detalle; se eliminan
  `listarTomas`/`detalleToma`/`borrarToma` (admin ya no los usa tras R9a) →
  script mínimo.
- `inventario.html`: al enviar, filtra el payload → manuales completos +
  productos con `observacion !== ''`. Catalogados sin observación NO viajan
  (ya están en Xetux vía export y en D1 vía sync). Si una toma no tiene
  excepciones, no se llama al Apps Script.
- `procesarNotas` se conserva (NOTAS es parte del libro de excepciones); el
  update de filas MAESTRA solo aplica si la fila existe.
- AREA_CONFIG (inventario.html) y ALMACENES (admin.html): los 7 almacenes
  Piazza apuntan a la URL única del centro; los `UH_*` a la suya.
- **Done R9b:** toma de prueba en beta/staging escribe SOLO excepciones en
  MAESTRA, sin pestaña nueva, foto sube a Drive; toma íntegra visible en admin
  vía D1; export Xetux intacto; Piazza y UH con el mismo Code.js.

- **Preparación real de COCINA (post-R5):** subir plantilla COCINA desde admin →
  tab Preparación → "Crear: 1 zona con todo activo" → Desactivar visibles →
  filtrar y activar las ~60 proteínas → Guardar y activar. El resto de artículos
  queda capturable vía búsqueda ("Fuera de zona · en plantilla").

- **Apps Script UH — HECHO 2026-07-13:** segundo proyecto con el MISMO
  `scripts/centro/Code.js` (proyecto `1SYgnEk8…QKVG`; `.clasp.uh.json` /
  `.clasp.piazza.json` guardan los scriptIds — copiar el que toque a
  `.clasp.json` antes de push). Incidente: se corrió `setupPiazza` en el
  proyecto UH (el dropdown del editor preselecciona la primera función) →
  reparado con `fixUH()` de un solo uso que renombró libro/carpeta y corrigió
  CENTRO=UH conservando IDs. Verificado: ping `centro:"UH"`, POST de prueba →
  1 fila en MAESTRA sin pestañas extra. URL en `SCRIPT_CENTRO.UH`.
  `scripts/universal/` queda obsoleto (nunca se desplegó).
- ~~**Merge de datos BARRA_RESTAURANTE 2026-07-05/06**~~ OBSOLETO 2026-07-13: esas
  filas ya no existen en D1 — la toma completa del 07-13 (Daniel, 137 arts,
  exportada) las dejó sin efecto. NUEVO pendiente detectado: **BARRA_AMICI
  2026-07-09 sin exportar** (César, 328 arts — parece la toma completa; la del
  07-13 con 78 arts fue exportada). DECIDIDO por Pablo 2026-07-13: fue una toma
  extraordinaria que NO se carga a Xetux — se queda sin exportar a propósito.
- **Diagnóstico importación Xetux:** Pablo intenta importar un archivo generado por la
  app (con R2 desplegado) y reporta el error exacto si lo hay. Empírico, ver §9.
- **`inventario-beta.html`:** copia de inventario.html apuntando al Worker staging,
  servida por el mismo GitHub Pages → staging real de frontend probable desde teléfono.
  Crearla al inicio de R1 (primer slice que toca inventario.html).

### R10 — Costeo por restaurante (diseño, 2026-07-16)

**Contexto.** El scraper se ELIMINÓ del proyecto el 2026-07-16 (fallaba a diario, con
fallas silenciosas —descargas con fechas incorrectas—, IDs PrimeFaces frágiles; el
costeo es semanal/mensual y no justifica scraping). `cargar_xetux.py` (sistema
Operaciones, no costeo) quedó apartado en `operaciones/` con README, pendiente de
confirmar si Operaciones sigue vivo. El costeo se rediseña sobre datos que ya existen
(las tomas en D1) + exports manuales de Xetux. Camino futuro preferido: leer la **DB
del servidor físico de Xetux** (está en el restaurante, bajo control de Pablo; la API
del vendor se pidió desde marzo y no llega). Ese diagnóstico es independiente de estos
slices — si se logra, la captura manual colapsa a queries directas.

**Hechos confirmados por Pablo (2026-07-16) que fijan el diseño:**

1. NO existen movimientos de producto entre Piazza y UH → las transferencias internas
   se anulan a nivel centro; solo importan para el desglose por almacén.
2. Al aplicar una toma parcial, **Xetux pone en CERO los artículos no contados** → los
   inventarios cerrados de Xetux NO sirven como frontera de valor (explica BARRA
   feb-2026 con 5 artículos / $1,972). La frontera canónica son las tomas de la app en
   D1 (`inv_sesiones` exportadas, totales vía `sesion-merge`). El stock teórico de
   Xetux ("inventario actual") tampoco es confiable en cantidades para los no contados
   — se usa SOLO como catálogo de costos.
3. Cadencia: semanal (entre tomas) + mensual.

**Ecuación de dos capas (por almacén, entre tomas consecutivas):**

```
Capa contada  (artículos presentes en AMBAS tomas frontera):
              costo = toma_inicial + compras + transf_netas − toma_final
Capa Δ=0      (todo lo demás): costo = compras + transf_netas del periodo
Costo almacén = capa contada + capa Δ=0
Costo centro  = Σ almacenes (las transferencias internas se anulan solas)
```

Reglas: artículo contado en solo UNA de las dos tomas frontera → cae a capa Δ=0 ese
periodo (por eso las preparaciones §14 deben ser estables semana a semana). Semana sin
toma de un almacén → su periodo se extiende hasta la siguiente toma y el reporte
semanal lo marca "sin corte". GENERAL/SALUMERIA sin semáforo de % costo (sus "ventas"
son transferencias enviadas — decisión 2026-03-25). Valuación: costo promedio vs
último costo se decide con datos del piloto (correr ambos y comparar); cadena de
fallback de costo: costo promedio → último costo → último costo de compra → flag "sin
costo".

**Insumos (4 XLS por centro, export manual de Xetux en la sesión semanal que Pablo ya
hace — ~10 min):** compras detalle, transferencias, inventario actual (solo costos),
ventas consolidado.

**R10a — Piloto manual (compuerta).** Un mes de datos, cero código permanente: cruzar
los 4 XLS con las tomas D1 y producir (1) costo real por almacén y por centro, (2)
auditoría de artículos con movimiento/stock y costo $0 (lista concreta para corregir
en Xetux), (3) cobertura ABC: % del valor del consumo que cae en capa contada, por
almacén. **Go/no-go:** go si los números le resultan creíbles a Pablo y la cobertura
contada de los almacenes grandes es razonable (o ampliable vía preparaciones §14);
no-go = primero corregir costos $0 en Xetux / ampliar listas de conteo, sin construir
nada. UH arranca como compras puras (todo capa Δ=0) hasta tener plantillas y tomas
reales.

**R10b — Tab Costos en admin (solo con go).** Carga manual: arrastrar los 4 XLS al tab
→ parseo en navegador (SheetJS ya presente; mismo patrón que la subida de plantillas)
con **validación antes de aceptar** (fechas dentro del rango declarado, totales > 0,
almacenes esperados presentes) → POST al Worker → tablas D1 nuevas con columna
`centro` (`costos_articulos`, `mov_compras`, `mov_transferencias`, `mov_ventas`) →
`GET /costos/resumen` calcula la ecuación → UI: ventas, compras, costo real en dos
capas, % vs ventas, **cobertura del conteo** (indicador de confianza del reporte) y
desglose por almacén. Cero Python, cero cron, cero Playwright.

**R10c — Brecha real (fase 2).** `brecha = costo real − costo teórico`
(recetas/consumo de Xetux) = mermas + desperdicio. Cierra el rediseño de reportes
pendiente desde 2026-03-27 — ahora con la ecuación correcta debajo.

### Reglas transversales (heredadas de plan v1, vigentes)

- Rama `feat/slice-*` desde main; merge a main solo con el "Done" cumplido y verificado.
- Worker: staging primero; migración D1 primero en staging; backup antes de migrar prod.
- Frontend: probar local (`python -m http.server`) + beta apuntando a staging.
- Almacén de prueba: CAVA (multi-zona: también ALIMENTARI). BARRA_AMICI como entorno
  poco viciado.
- Antes de cualquier carga real a Xetux: `tools/merge_inventario.py` dry-run y revisar
  `validation_report.json`.
- Nunca committear secrets; viven en `wrangler secret`.
- Cada slice termina actualizando ESTE documento.

---

## 16. Apps instalables (PWA) — IMPLEMENTADO (2026-07-15)

**Regla dura de Chrome Android: UNA app instalada por scope.** La primera app
instalada captura toda URL dentro de su scope; "instalar" otra en el mismo scope solo
crea un acceso que abre dentro de la existente. Ni `id` distintos en el manifest ni
cambiar `<link rel=manifest>` con JS lo resuelven (Chrome captura el manifest al
parsear la página — probado y fallado 3 veces antes de llegar a esta arquitectura).

### Arquitectura (scopes disjuntos)

| App | URL de instalación | Manifest (id) | Scope |
|---|---|---|---|
| Inventario Piazza | `…/inventario-cocina-piazza/inventario.html` | `manifest.webmanifest` (`inventario-piazza`) | `inventario.html` |
| Inventario UH | `…/inventario-uh/inventario.html` | `manifest-uh.webmanifest` (`inventario-uh`) | `/inventario-uh/` |
| Admin | `…/inventario-cocina-piazza/admin.html` | `manifest-admin.webmanifest` (`admin-inventario-piazza`) | `admin.html` |

- `scope` acotado a un archivo es válido: el matching es por prefijo de string del path.
- El `<head>` de inventario.html emite manifest/iconos con `document.write` al parseo,
  según pathname (`/inventario-uh/` → UH) o `?centro=UH`.
- Iconos: `branding/icon-*` (Piazza), `icon-uh-*` (UH), `icon-admin-*` (admin, sliders
  slate — el admin es multi-centro y no lleva emblema de Piazza). 180/192/512 cada uno.

### Repo espejo `pabloaranda-max/inventario-uh`

Copia **byte-idéntica** de `inventario.html` + `manifest-uh.webmanifest` + `branding/`
(+ `index.html` redirect y `.nojekyll`). Sincronización AUTOMÁTICA:
`.github/workflows/sync-uh.yml` corre `tools/sync-uh.sh` en cada push a main que toque
esos archivos, autenticando con deploy key (secret `UH_DEPLOY_KEY`, escritura solo al
espejo). El script también corre a mano como fallback.

### Reglas operativas

- Apps ya instaladas congelan icono/nombre/scope al instalar; cambios de manifest
  llegan por el ciclo de actualización de WebAPK o reinstalando.
- La URL vieja `…?centro=UH` sigue sirviendo en navegador; para INSTALAR UH se usa el
  espejo (en la URL vieja chocaría con el scope de Piazza).
- El caché HTTP de GitHub Pages es de 10 min — probar instalaciones después de ese
  lapso o borrando datos del sitio.
