# operaciones/ — carga a Xetux (producción/merma)

`cargar_xetux.py` carga producciones y mermas autorizadas a Xetux vía Playwright.
Es parte del sistema de **Operaciones** (producción + merma con votación 2-a-1), NO
del scraper de costeo, que se eliminó por completo el 2026-07-16 (fallaba a diario, se
sustituye por captura semanal manual / futura API-DB de Xetux).

Este archivo quedó **apartado, pendiente de confirmar si Operaciones sigue vivo.** Si el
sistema ya no se usa, se puede borrar. Si se usa, este es su hogar.

## Dependencias
`pip install -r requirements.txt` (Playwright + Chromium: `python3 -m playwright install chromium`)

## Variables de entorno (`.env` junto al script)
```
POS_URL=http://tu-servidor:9090/posadmin
POS_USER=usuario
POS_PASSWORD=contrasena
WORKER_URL=https://tu-worker.workers.dev
SYNC_TOKEN=token-secreto
```
