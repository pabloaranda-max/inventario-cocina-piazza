# Inventario — Bitácora de incidentes

> Registro **histórico** de fallas en producción de `inventario.html` / `admin.html` /
> Worker `operaciones-api`. Complementa a `inventario-spec.md`, no compite con él:
>
> - **El spec es normativo** — describe cómo DEBE comportarse el sistema. Se corrige.
> - **Esta bitácora es histórica** — registra qué PASÓ. Es *append-only*: una entrada
>   no se reescribe ni se borra cuando el bug se arregla; se le agrega la resolución.
>   Un incidente no deja de haber ocurrido porque ya esté resuelto.
>
> No es un documento de planeación (la regla del spec sobre no crear planes paralelos
> sigue intacta: el plan vive en `inventario-spec.md` §15). Entradas más recientes
> primero.

## Qué cuenta como incidente (definido con Pablo, 2026-07-26)

**Incidente = evento no planeado que degradó el servicio _o_ corrompió datos en
producción.** No hace falta que la app se haya caído, ni que alguien lo haya notado en
el momento.

Se registra igual si:
- la falla fue **silenciosa** (nadie se enteró hasta días después),
- ya está **arreglada** antes de escribir la entrada,
- la causa raíz quedó **sin confirmar**.

El criterio se fijó porque las dos fallas más caras del proyecto hasta hoy —`#NUM!` y
`defaultPres = '{}'`— fueron invisibles, y una bitácora que solo admita caídas visibles
registraría justo las que menos cuestan. Regla práctica: **si el sistema mintió, es
incidente**, aunque nunca haya dejado de responder.

## Formato de entrada

Copiar este molde. **"Causa raíz: NO CONFIRMADA" es una entrada válida y útil** — si el
patrón se repite, tres entradas honestas apuntan mejor que una teoría inventada.

```markdown
## AAAA-MM-DD — Título corto del síntoma
- **Impacto:** qué no funcionó, a quién afectó, cuánto duró, si hubo pérdida de datos.
- **Detección:** cómo nos enteramos (reporte de alguien / monitoreo / al usar).
- **Causa raíz:** el mecanismo, o NO CONFIRMADA + candidatos ordenados.
- **Evidencia:** qué se verificó y con qué resultado (lo que descarta cuenta igual).
- **Resolución:** qué se cambió, commit, fecha de salida a prod.
- **Lección:** qué se hizo distinto para que no vuelva a pasar (o quede detectado).
```

---

## 2026-07-26 — La app no cargaba ("URLs muertos")

- **Impacto:** `inventario.html` inaccesible para Pablo durante unos minutos. Se
  recuperó sola, sin intervención. Sin pérdida de datos. Duración real **desconocida**
  (sin monitoreo, nadie observó el error exacto mientras ocurría).
- **Detección:** reporte manual de Pablo, ya con la falla en curso.
- **Causa raíz:** **NO CONFIRMADA.** El incidente fue transitorio y no dejó rastro.
  Candidatos, en orden de probabilidad:
  1. **`cdn.sheetjs.com` lento o caído.** Es el único tercero capaz de matar la app
     entera: `inventario.html:326` carga 950 KB sin `defer`, y el parser se detiene
     ahí **justo antes** del `<script>` con toda la lógica. Da el síntoma exacto —
     página "cargada" pero muerta.
  2. **Bache de red o DNS local** (wifi del restaurante / datos del teléfono).
  3. **Blip del edge CDN de GitHub Pages.** Posible, el menos probable.
- **Evidencia (todo verificado el 2026-07-26, ya recuperado):**
  - Pages Piazza: `inventario.html`, `admin.html`, `index.html`, las 6 apps viejas y
    los 3 manifests → **200**.
  - Espejo UH → 200 (los 404 de `admin.html` y `manifest.webmanifest` ahí son por
    diseño: `sync-uh.sh` solo copia lo de UH).
  - Build de Pages: `built`, commit `6fc9413`, punta de `main`.
  - `main` sincronizado con `origin/main` → **cero deploys entre el 07-23 y el
    incidente**. No fue nada que hubiéramos desplegado.
  - Worker `operaciones-api` respondiendo; POST sin sesión → 401 (correcto).
  - Guard R12: `MIN_APP_VERSION=1` = `APP_VERSION=1` → **no** estaba emitiendo 426.
  - `cdn.sheetjs.com` al momento de probar: 200, 950 KB en 0.35 s (no prueba nada
    sobre el momento de la falla).
- **Resolución:** ninguna aplicada aún. Descubrió tres fragilidades estructurales
  reales, independientes de cuál de los tres candidatos haya sido:
  1. **Tres dominios en el camino crítico** (`github.io` + `cdn.sheetjs.com` +
     `workers.dev`; `admin.html` suma `cdnjs.cloudflare.com` para html2pdf). Cualquiera
     de los dos primeros caído = app muerta.
  2. **`xlsx-latest` es etiqueta móvil** — SheetJS puede cambiar la librería del export
     sin un solo commit nuestro. Riesgo silencioso, aparte del de disponibilidad.
  3. **Cero caché local** — no existe `sw.js` ni registro de `serviceWorker` en ninguna
     de las dos apps. Instalables como PWA, pero 100 % dependientes de red en cada
     apertura.
  Plan acordado, en este orden: **(a)** vendorizar `xlsx` y `html2pdf` con versión fija;
  **(b)** decidir hosting (Pages vs Workers Static Assets) **antes** del service worker,
  porque el SW se registra por origen; **(c)** service worker network-first para el HTML
  con caída a caché. Detalle del análisis de hosting en la conversación del 07-26.
- **Lección:** el proyecto **no tiene detección** — esta bitácora nace de aquí. Ningún
  incidente transitorio va a tener causa confirmada mientras la única señal sea que
  alguien esté mirando. Pendiente barato: ping periódico a Pages y al Worker
  (UptimeRobot, o un cron del propio Worker avisando a Slack — ya hay crons e
  integración Slack en el proyecto).

---

## 2026-07-23 — Export con `#NUM!` por caché vieja del admin

- **Impacto:** un `admin.html` con `js/sesion-merge.js` viejo en caché exportó celdas
  `#NUM!` — **11 minutos después** del deploy de R11. Export roto, corregible
  reexportando con la app actualizada.
- **Detección:** al usar, el mismo día del deploy.
- **Causa raíz:** **confirmada.** GitHub Pages cachea ~10 min y los teléfonos/pestañas
  retienen más. R11 cambió el formato de datos (arrays de desglose por presentación);
  el `sesion-merge.js` viejo hacía `array × factor` → `NaN` → `#NUM!` en el xlsx. Un
  cliente viejo conviviendo con datos nuevos. El merge por `zona:deviceId` impide que
  un operario viejo pise rebanadas ajenas, pero **no** impide que vea NaN ni que
  produzca exports rotos — y cada slice futuro agrandaba el riesgo.
- **Resolución:** **R12 — guard de versión de app**, EN PROD el mismo 2026-07-23
  (`70acc94`). Versión entera monotónica que se bumpea solo cuando cambia el formato de
  datos: los frontends mandan `appVersion` en cada POST `/inv/*`, el Worker rechaza con
  **426** lo que venga por debajo de `MIN_APP_VERSION`. Contrato en spec §7, diseño y
  playbook de deploy en §15 R12. Lo capturado no se pierde: vive en localStorage y se
  re-sincroniza tras actualizar.
- **Lección:** **bumpear `MIN_APP_VERSION` en `wrangler.toml` SOLO después de verificar
  que Pages ya sirve el frontend nuevo.** El orden inverso brickea a todos los clientes.
  Este pie de banco existe porque frontend (Pages) y Worker (Wrangler) son dos deploys
  separados — servir la app desde el propio Worker lo volvería atómico y lo eliminaría.

---

## 2026-07-21 — `defaultPres` vacío en los 8 almacenes: el export mandaba botellas como litros

- **Impacto:** **el peor de los tres.** Silencioso y de larga duración. `default_pres`
  estaba en `'{}'` en los **8 almacenes de producción**, así que los artículos sin
  presentación explícita se exportaban **sin convertir** — botellas contadas como
  litros. La admin mostraba "✓ Guardado" y los defaults parecían configurados.
  Duración: indeterminada, hasta v4.9 inclusive.
- **Detección:** al revisar contra el servidor, no por ninguna alerta. Nada en la
  interfaz delataba el problema; el "✓ Guardado" era la mentira.
- **Causa raíz:** **confirmada.** Al guardar defaults, una fila incompleta o con factor
  ilegible **se descartaba callada** y se persistía `{}`. Causa contribuyente: el campo
  de factor era `type=number`, y teclear `0,75` con coma decimal deja `value=""` — así
  que el usuario veía su número escrito y el navegador entregaba vacío.
- **Resolución:** v4.10 (spec §5). Guardar es **todo-o-nada y verificado**: fila
  inválida → no se guarda nada y se marca la fila; el factor acepta coma (`type=text` +
  `inputmode=decimal`); guardar vacío pide confirmación porque BORRA; y tras el POST se
  relee del servidor y se compara, así que "✓ Guardado" significa guardado. El editor se
  oculta si el almacén no tiene plantilla (antes conservaba las filas del anterior).
  `factorDefault()` en `js/sesion-merge.js` quedó como única implementación válida
  (presMap → defaultPres → 1), compartida por Worker y admin.
- **Lección:** dos, y las dos generales:
  1. **Un "✓ Guardado" que no verifica contra el servidor es peor que no mostrar nada** —
     convierte un fallo en una garantía falsa.
  2. **Descartar entradas inválidas en silencio es un modo de falla, no una tolerancia.**
     Si una fila no se puede guardar, hay que decirlo y no guardar nada.
  Señal de alerta para el futuro: si `default_pres` vuelve a aparecer como `{}` en todos
  los almacenes, sospechar de esa ruta otra vez.
