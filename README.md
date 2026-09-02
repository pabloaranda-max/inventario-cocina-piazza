# Piazza Pasticcio — herramientas internas

Este repositorio contiene **varios proyectos distintos**. El principal es la app de
inventarios; los demás conviven aquí por historia, no por diseño.

> **Regla de oro:** los archivos de la raíz marcados como *publicados* NO se mueven.
> GitHub Pages los sirve en direcciones fijas y las apps instaladas en los teléfonos
> del staff apuntan ahí. Moverlos rompe la app de todos.

## Inventarios (proyecto principal)

App de **conteo** de inventario. Una vez que la toma se sube a Xetux, **Xetux es la
fuente de verdad** — esta app no gestiona inventario.

| Archivo | Qué es | |
|---|---|---|
| `inventario.html` | La app que usa el staff para contar | **publicado** |
| `admin.html` | Panel de administración: tomas, plantillas, export | **publicado** |
| `index.html` | Portada con los enlaces | **publicado** |
| `manifest*.webmanifest` | Definen las apps instalables (PWA) | **publicado** |
| `vendor/` | Librerías que la app carga en vivo | **publicado** |
| `worker/operaciones-api/` | Backend en Cloudflare Worker + base D1 | |
| `js/` `tools/` `tests/` `scripts/` | Módulos, utilidades y pruebas | |

**Direcciones en producción**
- App: https://pabloaranda-max.github.io/inventario-cocina-piazza/inventario.html
- Admin: https://pabloaranda-max.github.io/inventario-cocina-piazza/admin.html
- Universal de Hamburguesas: repo espejo `inventario-uh`, se sincroniza solo en cada push

## Carpetas

| Carpeta | Contenido |
|---|---|
| `docs/` | Documentación viva. **`inventario-spec.md` es el contrato normativo**; `inventario-incidentes.md` es la bitácora de fallas de producción |
| `archivo/` | Apps viejas ya reemplazadas y código retirado. Se conservan como respaldo |
| `reportes/` | Reportes generados (PDF, Excel, HTML). **Ignorado por git** — son salidas, no código |
| `costo-semanal/` `reportes-inventario/` | Scripts de Python que generan esos reportes |
| `branding/` | Recursos de marca |

## Otros proyectos que vivían aquí

Todos salieron a su propio repositorio el **2026-09-02**. Se clonan en `~/piazza/`.

| Proyecto | Dónde vive ahora |
|---|---|
| Mantenimiento del restaurante | `pabloaranda-max/mantenimiento-restaurante` (privado) |
| Alimentari B2B | `pabloaranda-max/brainalimentaripasticiob2b` — frontend, Worker y Apps Script juntos |
| nix-finanzas | `pbloaranda-hub/nix-finanzas` (otra cuenta de Cloudflare) |
| Operaciones (producción y mermas) | Archivado en `archivo/` — su backend dejó de responder |

Este repositorio es, desde entonces, **solo inventarios**.


## Respaldos

La base D1 **no** se respalda sola. Para hacerlo a mano:

```bash
cd worker/operaciones-api
wrangler d1 export operaciones-db --remote \
  --output="$HOME/backups/operaciones-db-backup-$(date +%F).sql"
```

Lo que se protege ahí es la **configuración** —catálogos, plantillas con presentaciones
por defecto, zonas, admins y recibos—, que reconstruir a mano costaría semanas.
El historial de tomas no vive en D1: vive en Xetux.
