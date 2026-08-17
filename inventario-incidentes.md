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

## 2026-08-16 — Reproducción deliberada: "nueva toma" borra la rebanada ya cerrada (UH_COCINA)

> **No es un incidente** bajo el criterio de esta bitácora: no fue un evento *no planeado*.
> Pablo lo provocó a propósito, en el celular de Daniel, **para observar exactamente qué
> pasaba** — y descargó el acuse antes de disparar la prueba. Se asienta aquí, y no en el
> spec, porque es la **confirmación experimental del incidente del 2026-07-31**: los dos se
> leen juntos o ninguno se entiende. La corrupción de datos fue real y hubo que repararla,
> así que merece registro con el mismo rigor.

- **Qué se probó:** si darle **"nueva toma"** en un teléfono que ya cerró una zona destruye
  su captura anterior. **Sí la destruye, en silencio.** Durante la primera toma completa de
  Universal, Daniel Cervantes cerró la zona Cocina de `UH_COCINA` a las 20:48 CDMX con 63
  artículos (acuse `ACU-20260816-8402168F64BB440B6E5219D2`). A las 20:49 Pablo bajó el PDF
  del acuse; a las ~21:01 disparó "nueva toma" en ese mismo teléfono
  (`mswlwo8p04zf12nr6lq7`), y a las 21:02 la sesión viva tenía 34 artículos en vez de 63.
- **Impacto real:** **46 códigos desaparecieron de la sesión viva** en producción, durante
  una toma en curso. El POST devolvió 200 y la app no advirtió nada. De haber exportado así,
  esos 46 habrían entrado a Xetux como CERO. Sin pérdida definitiva: los 63 estaban íntegros
  en el acuse y se restauraron el mismo día. **Ni Daniel ni ningún operario cometió error
  alguno** — su captura de 63 y su segunda pasada de 35 eran las dos trabajo real y correcto.
- **Mecanismo confirmado:** el mismo del 2026-07-31, ahora **reproducible a voluntad**.
  `mergeZoneMap` (`js/sesion-merge.js:9`) reemplaza la rebanada completa cuando la clave
  lleva `:`, porque esa clave representa el estado TOTAL de ese dispositivo. **"Nueva toma"
  no cambia el `deviceId`**, así que el estado local nuevo viajó bajo la misma clave
  `0:mswlwo8p04zf12nr6lq7` y sobreescribió los 63. El 31 de julio la variante fue *dos
  operarios* en un celular; ésta es *el mismo operario* reiniciando. Un solo mecanismo, dos
  disparadores distintos, cero advertencias en ambos.
- **Evidencia:** el acuse verifica (`verified: true`, plantilla `23d5e56acf3167db`, la
  misma de la sesión). Diagnóstico exacto: 46 códigos solo en el acuse, 17 solo en la
  captura viva, y 17 en ambos **con cantidad distinta en los 17**. No era un subconjunto:
  las dos pasadas traían trabajo real y distinto. La zona terminó con **tres acuses**, que
  cuentan la historia completa: `…8402168F64BB440` (02:48:13Z, 63), `…195239DE68F1059`
  (03:03:23Z, 34) y `…F575011AFFF46A9` (03:06:29Z, 35, el cierre bueno). Los tres bajo la
  misma clave `0:mswlwo8p04zf12nr6lq7`, que es justamente el síntoma: la clave se reusó y
  por eso la rebanada se pisó, pero cada cierre dejó su copia intacta.
- **Resolución:** los 63 se restauraron desde el acuse bajo una clave de rebanada **nueva**
  (`0:rec-acu840`), con la toma todavía viva y sin tocar la captura del teléfono. Pablo
  confirmó que la segunda pasada era conteo real de otra área física, así que los 17
  traslapados **se suman**. Verificado: 2 rebanadas (35 + 63), 81 códigos con total, los 46
  recuperados con total > 0, y los traslapes en los valores esperados (CEBOLLA MORADA
  1.785 + 14.005 = 15.79). Total base de la toma 715.477. Herramienta nueva y reutilizable:
  `tools/restaurar-acuse.mjs` (dry-run por defecto, aborta si el acuse no verifica o si la
  plantilla cambió desde el conteo). Sin cambios en el producto.
- **Lección:** restaurar **siempre bajo clave nueva** — `calcularTotalesSesion` suma las
  rebanadas, así que la suma sale sola, y como la clave no pertenece a ningún teléfono, los
  syncs que siguen llegando no la pueden pisar. Por eso se pudo reparar **sin detener la
  toma**. Dos trampas confirmadas al reconstruir: el acuse guarda las líneas de desglose
  como `{name, factor, quantity}` pero `countsByZone` las espera `{n, f, q}` (copiarlas
  literal deja 18 artículos en CERO), y el POST necesita `appVersion: 2` o la guarda R12
  responde 426.
  **Lo que la prueba compró:** el mecanismo deja de ser una teoría deducida del incidente
  del 31 y pasa a ser reproducible a voluntad, que es lo que permite diseñar el arreglo con
  confianza; y de paso probó la ruta de recuperación **de punta a punta sobre datos vivos**,
  algo que staging no habría demostrado igual. **Lo que costó:** 46 artículos corruptos en
  producción durante una toma real, salvados únicamente porque el acuse existe. La próxima
  reproducción de este tipo va en `operaciones-api-staging`, que existe justo para esto;
  si tiene que ser en producción, que sea con la zona ya exportada y no a media captura.
  **Pendiente que esto vuelve urgente:** "nueva toma" sobre un dispositivo que ya contribuyó
  a una toma abierta debe ser una **pregunta**, no un borrado silencioso — es el argumento
  de la toma planeada. Y para el agente monitor: una rebanada que PIERDE artículos entre dos
  syncs (63 → 34, misma clave) es detectable en automático y habría avisado a las 21:02.

## 2026-07-31 — Dos operarios en el mismo celular: el segundo cierre borró el conteo del primero

- **Impacto:** en COCINA, durante la primera toma 100 % digital, **Lau perdió 18 artículos
  de una zona ya cerrada**. Cerró a las 05:27:55Z con 18 artículos; tres minutos después
  Enrique cerró desde el **mismo dispositivo** (`mrv09m7me1xm0i0nb8i`) con 3 artículos, y
  la rebanada quedó con esos 3. Silencioso: ambos POST devolvieron 200 y la app mostró la
  zona cerrada correctamente. Sin pérdida final —los 18 vivían íntegros en el acuse— pero
  de haber exportado sin revisar, 15 artículos de repostería (chocolates, avellana,
  pistache, crema para batir) habrían entrado a Xetux como CERO. El mismo mecanismo se
  llevó una rebanada de 2 artículos de Pablo en ALIMENTARI.
- **Detección:** por reconciliación, no por aviso. Nadie reportó nada. Al comparar los 28
  acuses de la jornada contra las sesiones vivas, apareció una rebanada cuyo acuse
  histórico tenía 18 códigos y la sesión 3.
- **Causa raíz:** **confirmada.** La clave de rebanada es `zonaIdx:deviceId`
  (`js/sesion-merge.js:9`) y **no incluye al operario**. `mergeZoneMap` reemplaza la
  rebanada completa cuando la clave lleva `:` —comportamiento correcto y deliberado, es lo
  que permite borrar una cantidad—, así que dos personas que usan el mismo aparato
  comparten clave y la última escritura gana. La atribución también se pierde:
  `operarios_by_device` guarda solo el último operario por dispositivo, así que la sesión
  quedó diciendo que esa rebanada era de Enrique.
- **Evidencia:** acuse `2026-08-01T05:27:55.277Z` (Laura, 18 ítems) y acuse
  `2026-08-01T05:30:20.063Z` (Enrique, 3 ítems), ambos con `device_id`
  `mrv09m7me1xm0i0nb8i` y `zone_key` `0:mrv09m7me1xm0i0nb8i`. Los 3 de Enrique son códigos
  distintos a los 18 de Lau: no fue un recuento, fue un reemplazo. De los 18, 17 no
  chocaban con nadie; el MP0482 sí, y era duplicado exacto del que ya tenía Lucero
  (13 × PIEZA .980KG en ambos).
- **Resolución:** los 17 se restauraron el 2026-08-01 en una rebanada nueva
  `0:mrv09m7me1xm0i0nb8i-lau` vía `POST /inv/sesion`, aditiva, sin tocar los 3 de Enrique.
  Verificado contra el acuse artículo por artículo. **El bug sigue en producción:** nada
  impide que vuelva a pasar mañana.
- **Lección:** **lo que salvó la toma fue R23.** `inv_receipts` es append-only y ningún
  `DELETE` del Worker la toca; sin los acuses, esta pérdida habría sido irreversible y
  probablemente invisible. Segunda lección: **la clave colaborativa protege contra
  dispositivos distintos, no contra personas distintas.** En un almacén con más operarios
  que teléfonos —que fue el caso de COCINA, 9 personas— compartir aparato es lo normal, no
  la excepción. El arreglo es incluir al operario en la clave o generar `deviceId` nuevo al
  cambiar de operario.

---

## 2026-07-31 — La toma se partió en tres fechas y el export habría puesto en cero lo contado

- **Impacto:** la primera toma 100 % digital quedó repartida en **filas de tres fechas
  distintas**: ALIMENTARI y COCINA con una fila del 31/07 y otra del 01/08, y
  BARRA_RESTAURANTE con 127 artículos de contrabarra en una fila del **28/07**. Como el
  export es por `(almacen, fecha)`, exportar cualquiera de ellas habría mandado a Xetux
  como CERO lo que contó la otra: **159 artículos en riesgo**. Sin pérdida final: se
  detectó antes de exportar y ninguna toma se había exportado.
- **Detección:** al listar las sesiones escritas durante la jornada apareció una fila con
  `fecha = 2026-07-28` actualizada a las 05:57Z de hoy, y dos almacenes con dos filas cada
  uno.
- **Causa raíz:** **confirmada, y son dos mecanismos distintos.** (1) `inv_sesiones` tiene
  `PRIMARY KEY (almacen, fecha)` y el cliente propone `fechaOperativaCDMX()`: una toma que
  cruza la medianoche real de CDMX arranca fila nueva. La app **sí avisa**
  ("Iniciada otro día y sin cerrar. Continúala para que el conteo no se fragmente",
  `inventario.html:1096`) con botón "Continuar esta toma", pero el aviso es ignorable y se
  ignoró. (2) El dispositivo de Carlos (`ms57xty69bmf4nhv8pv`, creado el 28/07 16:19 CDMX)
  nunca recargó la app: siguió mandando el hash de plantilla viejo `0a43e966cd7c3a55`
  cuando el vigente era `95df67c1ba3e805a`, y escribió el conteo de hoy en su sesión del 28.
- **Evidencia:** acuse `2026-08-01T05:57:05.677Z` de Carlos, 127 ítems, `fecha` 2026-07-28,
  zona "CONTRA BARRA". En paralelo, la zona "Contrabarra" de la toma del 31 figuraba sin
  capturar. Los 127 códigos sí existen en la plantilla vigente, así que no habrían caído
  del XLSX por código ausente — habrían caído por estar en la fecha equivocada.
- **Resolución:** consolidado el 2026-08-01 en la fila del 31/07 de cada almacén, con
  escrituras aditivas y las filas origen intactas. El caso de Carlos necesitó **remapear la
  zona 2 → 1**: en la preparación legacy el índice 2 era "CONTRA BARRA", pero en la
  preparación vigente (`cfg_ms8l5pdn9ldn`) el 2 es "Refris servicio" y "Contrabarra" es el
  1; sin remapear, la app habría dado por contada una zona que sigue pendiente.
- **Lección:** **la regla de negocio y el modelo de datos no coinciden.** Para Piazza un
  almacén es UN conteo sin importar el cambio de día; para el sistema, la fecha es parte de
  la llave primaria. Mientras no se cierre esa brecha, toda toma que cruce la medianoche
  hay que consolidarla a mano antes de exportar. Segunda lección: **un aviso que se puede
  ignorar no es una guarda.** Tercera: un dispositivo con la PWA en caché puede seguir
  escribiendo contra una plantilla vieja días después, y el `template_hash` de la sesión es
  la señal que lo delata.

---

## 2026-07-31 — La plantilla de ALIMENTARI pasó por GENERAL y dejó 230 artículos pegados

- **Impacto:** durante la carga de las 7 plantillas frescas de Piazza, XTINV000288
  (ALIMENTARI) estuvo cargada en `GENERAL`. La plantilla se corrigió a XTINV000285 y
  quedó bien —434 artículos, 0 sin nombre—, pero **el catálogo de GENERAL conserva 230
  códigos de ALIMENTARI de forma permanente**, porque el upsert de R25 no borra. Catálogo
  en 672 donde correspondían 442. **Sin pérdida de conteos y sin efecto operativo:** no
  había tomas abiertas, y los dos consumos del catálogo filtran contra `rowMap`, así que
  un operario en GENERAL nunca ve esos 230. Es contaminación silenciosa de datos, no una
  degradación del servicio.
- **Detección:** por aritmética, no por aviso. Al verificar la tanda se había predicho un
  catálogo de 443 para GENERAL y salió 672; los 229 de diferencia no tenían explicación.
- **Causa raíz:** **confirmada en cuanto al mecanismo, no en cuanto al gesto.** Nadie
  reportó el paso en falso; se dedujo del dato. Lo confirmado es por qué nada lo frenó:
  **R26 no protege la primera carga a un almacén sin plantilla**, porque su guarda entera
  vive dentro de `if (previousTemplate?.row_map)`. GENERAL era exactamente ese caso, el
  único almacén sin plantilla previa, y por eso fue el único de los 7 donde un archivo
  equivocado podía entrar sin resistencia — el mismo día en que R26 salió a producción
  precisamente para impedir cruces. Y como R25 escribe catálogo sin `DELETE`, corregir la
  plantilla después no deshizo nada.
- **Evidencia:** de los 238 sobrantes del catálogo de GENERAL, **230 aparecen en
  XTINV000288 (96.6 %)**, con nombres inequívocamente de ALIMENTARI (`ACQUA PANNA 250ML`,
  `AGITADOR MADERA 15 CM`, `ALEX LIMPIADOR PISOS`). Contra las otras seis plantillas de la
  tanda el cruce cae a 23.9 % o menos. Los 8 restantes son los sobrantes preexistentes que
  GENERAL ya tenía antes de la carga. La plantilla vigente sí es la correcta: XTINV000285,
  434 códigos, ninguno con sufijo `_NNNN`.
- **Resolución:** **ninguna todavía.** El residuo sigue en producción; retirarlo es
  justamente R27. Al limpiar debe quedar en 442.
- **Lección:** **el hueco que se documenta pero no se cierra se cobra el mismo día.** El
  primer incidente de la noche dejó escrito que la guarda debía ser server-side y
  fail-closed; R26 se publicó cumpliendo eso para los almacenes con plantilla y dejando
  fuera los que no la tienen, que son los únicos donde un error es indetectable por
  comparación. La segunda lección es de método: **la contaminación no se detecta por
  aritmética de conjuntos.** Aquí uno de los 8 sobrantes legítimos también existe en la
  plantilla de ALIMENTARI, así que `catálogo − plantilla` no distingue residuo de
  histórico ni siquiera en un caso ya conocido. Sin procedencia por lote, la limpieza no
  puede ser automática.

---

## 2026-07-31 — La plantilla de CAVA se cargó en UH_MERCH

- **Impacto:** `UH_MERCH` quedó temporalmente con XTINV000289 de CAVA: su plantilla
  pasó de 8 artículos de mercancía a 149 vinos y su catálogo de 8 a 157 filas. CAVA
  no cambió. **No hubo pérdida de conteos:** UH_MERCH no tenía sesiones activas y
  plantilla, catálogo y sesiones viven separados.
- **Detección:** verificación inmediata posterior a la recarga de CAVA para activar
  el catálogo incremental R25. CAVA seguía en 121/149 nombres y con su hora anterior;
  al revisar todos los almacenes, UH_MERCH tenía el nombre, hash y 149 códigos exactos
  de XTINV000289.
- **Causa raíz:** **confirmada en el servidor.** El POST llegó con
  `almacen=UH_MERCH`; el Worker confiaba en ese valor. La única defensa vivía en
  Admin, comparaba códigos mediante un GET previo y era un `confirm` opcional
  (además de fallar abierto si ese GET fallaba), por lo que no era una restricción.

  **Por qué el daño llegó al catálogo, que el 27 de julio no había pasado — R25.** El
  código anterior escribía catálogo solo `if (!row.n)`, es decir únicamente si el
  almacén tenía CERO filas; con `UH_MERCH` en 8, una plantilla equivocada habría dejado
  el catálogo intacto. R25 (`0b204f2`, 07:14:48Z) conserva ese `COUNT(*)` solo para
  calcular la bandera `catalogoDerivado` de la UI y corre el upsert **sin condición**,
  así que los 149 códigos ajenos entraron. Y como el upsert **no tiene `DELETE` por
  diseño** ("conserva todo histórico"), volver a subir la plantilla correcta **no lo
  habría deshecho**: R25 convirtió este error de reversible en no autocorregible, y por
  eso la recuperación exigió restaurar desde respaldo en vez de una simple resubida.

  **Cómo se seleccionó el almacén equivocado — NO CONFIRMADA.** Candidatos, en orden:
  1. Verificación manual de R25 contra producción: la escritura ocurrió 5 minutos
     después del commit, R25 cambia justo el camino que solo se activa cuando el
     almacén **ya tiene catálogo** —`UH_MERCH` era uno de los pocos que calificaba— y el
     archivo a la mano era el de CAVA. Encaja en tiempo y en motivo.
  2. El selector `plt-almacen` conserva su valor entre subidas y se subió sin recorrerlo.
- **Evidencia:** UH_MERCH registró `updated_at=2026-07-31T07:19:48.056Z`,
  `template_hash=a3714f89ede7d6c6`, 149 códigos de CAVA y 157 filas de catálogo
  (8 originales + 149 entrantes); cero sesiones en los últimos 30 días. El respaldo
  previo R25 contenía XTINV000027, hash `9632e56996df68d4` y exactamente 8 códigos.
  No eran dos archivos parecidos sino **el mismo**: coincidían `templateHash` y el
  SHA-256 del `raw` (`a3714f89ede7d6c66b90…`). Medido en vivo antes de la restauración,
  el catálogo daba `{'3-1 VINO': 148, 'MERCH': 8, 'GRUPO DE PRODUCTO': 1}` con los 8
  propios (`CAMISA BLANCA`, `CAMISETA NEGRA`…) todavía presentes, lo que confirma que el
  upsert no borra. **Lo que queda descartado:** la prueba nueva
  `tests/smoke-worker-catalog-upsert.py` **no fue la causa** — corre contra wrangler
  local con datos sintéticos (`XTINVOLD`/`XTINVNEW`), solo toca `CAVA` y no menciona
  `UH_MERCH` ni `XTINV000289`. Tampoco es el incidente del 27 de julio repetido: el
  archivo era una plantilla legítima de Xetux, así que la guarda R16
  (`Application: SheetJS` / columna Cantidad llena) **hizo bien en no dispararse** — el
  problema no era el archivo sino el destino. Que los 148 vinos entraran al catálogo es
  además la prueba de que el Worker con R25 ya estaba desplegado en producción a las
  07:19:48Z: con el código anterior era imposible, porque `UH_MERCH` no tenía el
  catálogo vacío.
- **Resolución:** se guardó también el estado contaminado, se ensayó la restauración
  contra D1 local y se restauraron únicamente `inv_plantillas` y
  `catalogo_articulos` de UH_MERCH desde
  `operaciones-db-backup-2026-07-31-r25.sql`. Verificación final: XTINV000027,
  hash esperado, 8/8 códigos exactos; CAVA permaneció intacto. R26 convierte el
  cruce menor a 20 % en bloqueo sin override tanto en Admin como en Worker.
- **Lección:** tres.
  1. **Una guarda contra corrupción entre almacenes debe ser autoritativa, server-side y
     fail-closed.** Un diálogo de confirmación no es una barrera de integridad y una
     validación solo en cliente no protege clientes viejos ni fallas de red. Nota sobre
     la lección del 27 de julio: se escribió "cuando dos rutas hacen lo mismo, la guarda
     va en las dos" y se cumplió para las dos rutas del navegador, pero la ruta que de
     verdad escribe —el Worker— se quedó sin comprobar nada.
  2. **Ampliar lo que toca una escritura amplía lo que rompe un error de destino.** R25
     es correcto en lo suyo, pero pasó de escribir catálogo en un caso raro (almacén
     vacío) a escribirlo siempre, y nadie revisó qué pasaba si el almacén estaba mal. El
     radio de daño de una función es parte de su diseño, no un detalle de implementación.
  3. **Una tabla sin `DELETE` necesita un camino de reversa explícito.** "Conserva todo
     histórico" es la decisión correcta para el uso normal y deja sin salida al error;
     aquí la reversa fue restaurar desde respaldo. Mientras R25 siga, hace falta una
     forma soportada de quitar códigos que entraron por el almacén equivocado.

---

## 2026-07-27 — El export de CAVA se subió como plantilla de SALUMERÍA

- **Impacto:** SALUMERÍA quedó con la lista de artículos de CAVA (vinos) como plantilla
  vigente durante ~27 minutos, con una toma real en curso encima. Los 13 artículos
  contados por el operario aparecían "fuera de plantilla" y con el código en lugar del
  nombre. **Sin pérdida de conteos** — plantilla y sesión son tablas distintas. Exportar
  en ese estado le habría mandado ceros a Xetux para todo lo contado.
- **Detección:** Pablo, al intentar cerrar la toma con plantilla fresca; el guard de esa
  ruta avisó "13 artículos contados no están en la plantilla". La subida directa, en
  cambio, no había dicho nada en cuatro intentos.
- **Causa raíz:** **confirmada.** El diálogo de archivos de Windows abría en la carpeta
  de exports de CAVA, donde el único xlsx es el inventario ya contado que la propia app
  generó. Ese archivo y una plantilla de Xetux comparten el patrón de nombre
  (`Inventario XTINVxxxxxx <fecha>.xlsx`) porque Xetux valida el nombre al importar, así
  que en el diálogo son indistinguibles: solo cambia el consecutivo (279 contra 280).
  La pestaña Plantillas aceptaba cualquier xlsx para cualquier almacén sin una sola
  comprobación.
- **Evidencia:** el `raw` guardado en D1 pesaba 125,143 bytes y coincidía exactamente con
  `…\INVENTARIOS PP\PASTICIO\CAVA\Inventario XTINV000279….xlsx`; sus metadatos decían
  `Application: SheetJS` (Xetux escribe `Apache POI`) y traía 80 filas con cantidad ya
  capturada. El acceso directo de "Recientes" de Windows a ese archivo estaba fechado en
  el segundo exacto de cada escritura a D1 (21:45:00 y 21:56:41), y del archivo correcto
  no existía ningún acceso. Las cuatro subidas dejaron el **mismo hash**, o sea los
  mismos bytes cada vez. El archivo correcto, pasado por el parser real del proyecto,
  daba 80 artículos y contenía los 13 códigos contados.
- **Resolución:** la plantilla correcta se escribió directamente en D1 el mismo día
  (`XTINV000280`, hash `7c1fdefdb481723a`, 80 artículos, verificado). El arreglo de
  código va en el mismo commit que este incidente: la subida rechaza archivos con
  `Application: SheetJS` o con la columna Cantidad llena, y avisa cuando los códigos
  entrantes casi no coinciden con los que el almacén ya tiene.
- **Lección:** **cuando dos rutas hacen lo mismo, la guarda tiene que estar en las dos.**
  "Cerrar con plantilla fresca" sí comparaba lo contado contra el archivo y frenó; la
  pestaña Plantillas no comparaba nada y dejó pisar el almacén cuatro veces seguidas. El
  usuario hizo lo mismo en ambas y solo una lo protegió.

---

## 2026-07-27 — "Sesión no encontrada" al borrar una toma que ya no existía

- **Impacto:** menor y sin pérdida de datos. Al borrar una toma vacía de SALUMERÍA
  fechada el 7 de julio, el admin devolvía `Error al borrar: Sesión no encontrada` y
  seguía mostrando la tarjeta, así que cada reintento repetía el error.
- **Detección:** reporte de Pablo al usar el admin.
- **Causa raíz:** **el Worker decía la verdad** — esa fila ya no existía en D1. La tarjeta
  estaba obsoleta y el admin **no refrescaba la lista al fallar** (`cargarSesionesInventario()`
  solo se llamaba en el camino de éxito), de modo que la tarjeta fantasma se quedaba fija.
  Por qué desapareció la fila del 07-07 quedó **sin confirmar**; lo más probable es que un
  primer borrado sí funcionó y el teléfono, al no encontrar sesión en el servidor, recreó
  la toma con la fecha de hoy.
- **Evidencia:** en D1 no había fila `SALUMERIA / 2026-07-07`; sí una `SALUMERIA / 2026-07-27`
  con 13 códigos en 3 zonas cerradas y sincronizaciones posteriores a la captura de
  pantalla. Las otras cinco tarjetas coincidían con D1 al minuto, así que la lista no
  estaba obsoleta en general.
- **Resolución:** el admin ahora refresca la lista también en el error y distingue "esa
  toma ya no existe" de una falla real (mismo commit que el incidente anterior).
- **Lección:** dos, y la segunda sigue abierta:
  1. **Una acción que falla debe dejar la pantalla en el estado real del servidor**, o el
     usuario reintenta contra un fantasma indefinidamente.
  2. **Borrar no es durable mientras un teléfono siga vivo:** el sync es un
     `INSERT … ON CONFLICT` sin lápida, así que cualquier dispositivo que aún tenga la
     sesión en su localStorage la recrea en el siguiente envío, incluso bajo otra fecha.
     Va como pendiente al spec §15 (R17); empeora con R14 desplegado, que ahora sí
     reintenta.

---

## 2026-07-26 — La toma de CAVA no registró un solo conteo

- **Impacto:** la toma de CAVA del 26 quedó con **cero artículos** en el servidor. Si se
  hubiera exportado así, Xetux habría aplicado CERO a todo el almacén. Lo capturado por
  el operario, si existió, nunca salió de su teléfono.
- **Detección:** al revisar el tab Tomas antes de iniciar la toma del día siguiente; la
  tarjeta decía "0 artículos · 0 zonas listas".
- **Causa raíz:** **NO CONFIRMADA.** Lo único que llegó al servidor fue el candado de la
  zona 0 del dispositivo `ms2fjz2o7q9flgsxuqd` (Omar) a las 17:34:06, que es también el
  último `updated_at`. Después no llegó nada. Candidatos, en orden:
  1. **R14 — el cliente descartaba en silencio los POST fallidos** (`if (!r.ok) return;`),
     sin banner ni aviso: el operario pudo capturar toda la zona viendo la app normal
     mientras nada subía.
  2. La zona se tomó y no se capturó nada (se hizo en papel o se abandonó).
- **Evidencia:** `counts_by_zone = {}`, `completed_zones = []`, cero manuales, cero
  correcciones y `operarios_by_device = {}`; pero `zone_snapshot` y `template_hash` sí
  estaban congelados, o sea que la sesión se abrió correctamente. **No es R13**: la
  carrera deja rastro de conteos pisados, y acá nunca hubo conteos.
- **Resolución:** ninguna sobre esa toma — no hay nada que recuperar del lado del
  servidor. R14 y R15 salieron a producción el 2026-07-28 (ver §15), que es lo que
  convierte este modo de falla en visible: el cliente ahora reintenta, avisa con banner
  si se agota, y la confirmación de export dice cuántos artículos van y cuántos entran
  como CERO.
- **Lección:** **un sync que falla en silencio produce exactamente este incidente y no
  deja forma de distinguirlo de "no se contó nada".** Un año de tomas pudo tener casos
  así sin que nadie lo notara; sin banner en el cliente ni cobertura al exportar, no hay
  manera de saberlo retroactivamente.

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
