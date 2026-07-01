# Handoff - Mantenimiento Restaurante

Fecha: 2026-04-14

## Estado

App interna de mantenimiento para restaurante implementada en:

`/home/lilp/proyectos/mantenimiento-restaurante`

Deploy publico canonico:

`https://mantenimiento-restaurante.pablo-aranda.workers.dev/login`

## Stack

- Next.js 15.5.15 App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres y Storage
- OpenNext + Cloudflare Workers runtime

No hay Workers de negocio custom. El Worker es solo el runtime de deploy para Next.js.

## Supabase

Proyecto:

`vejitrxfbdhgqkqbtrrq`

URL correcta:

`https://vejitrxfbdhgqkqbtrrq.supabase.co`

Hecho:

- `.env.local` creado localmente.
- `npx supabase init` ejecutado.
- `npx supabase link --project-ref vejitrxfbdhgqkqbtrrq` ejecutado.
- `supabase/schema.sql` aplicado en remoto.
- Tablas creadas: `equipos`, `incidencias`, `mantenimientos`, `proveedores`.
- Bucket privado `mantenimiento` creado.
- RLS simple para `authenticated`.

## Cloudflare

Deploy verificado en la cuenta correcta:

`https://mantenimiento-restaurante.pablo-aranda.workers.dev/login`

Cuenta/host correcto:

`mantenimiento-restaurante.pablo-aranda.workers.dev`

No usar como referencia de produccion URLs bajo otras cuentas de Cloudflare, por ejemplo `*.nixsub.workers.dev`.

Secrets cargados en Worker:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Comando de deploy:

```bash
npm run pages:deploy
```

## Comandos

Local:

```bash
cd /home/lilp/proyectos/mantenimiento-restaurante
npm run dev -- -p 3000
```

Verificacion:

```bash
npm run lint
npm run build
npm run pages:build
```

Deploy:

```bash
npm run pages:deploy
```

## Pendientes sugeridos

- Probar login en la URL publica.
- Crear un equipo real y probar fotos.
- Agregar mensajes visibles de error/exito en formularios CRUD.
- Revisar UX movil de la navbar.
- Opcional: configurar dominio propio en Cloudflare.

## Nota de git

El proyecto esta creado en archivos reales dentro del repo, pero queda pendiente hacer commit.
