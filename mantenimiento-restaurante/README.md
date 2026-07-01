# Mantenimiento Restaurante

App interna de mantenimiento para un solo restaurante, construida con Next.js App Router, TypeScript, Tailwind CSS y Supabase.

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Copia variables:

```bash
cp .env.example .env.local
```

3. Configura `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

4. Ejecuta el SQL de `supabase/schema.sql` en Supabase.

5. Crea un bucket privado de Storage llamado `mantenimiento` y aplica las políticas indicadas en el SQL.

6. Corre la app:

```bash
npm run dev
```

## Cloudflare

El adaptador mantenido actualmente para Next.js en Cloudflare es OpenNext:

```bash
npm run pages:build
```

URL publica canonica:

`https://mantenimiento-restaurante.pablo-aranda.workers.dev`

Para desplegar desde CI o local, configura las variables de Supabase en Cloudflare y usa:

```bash
npm run pages:deploy
```

Verifica el deploy en:

`https://mantenimiento-restaurante.pablo-aranda.workers.dev/login`

No hay Workers de negocio en este proyecto; el adaptador solo empaqueta Next para Cloudflare.
