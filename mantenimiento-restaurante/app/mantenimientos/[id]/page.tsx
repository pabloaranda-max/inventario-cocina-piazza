import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eliminarMantenimiento } from '../actions'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrlMap } from '@/lib/storage'
import type { Mantenimiento } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function MantenimientoDetallePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ flash?: string }>
}) {
  const { id } = await params
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('mantenimientos')
    .select('*, activo:activos(id,nombre,area,clase,tipo), equipo:equipos(id,nombre,area), infraestructura:infraestructura(id,nombre,area,tipo), incidencia:incidencias(id,ticket_numero,descripcion,estado), proveedor:proveedores(id,nombre,especialidad)')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const mantenimiento = data as Mantenimiento
  const fotoUrls = await createSignedUrlMap(supabase, mantenimiento.fotos_urls)
  const destino = mantenimiento.activo ?? mantenimiento.equipo ?? mantenimiento.infraestructura
  const destinoNombre = destino?.nombre ?? mantenimiento.zona_nombre ?? 'Sin activo específico'
  const destinoArea = destino?.area ?? mantenimiento.zona_nombre
  const destinoHref = mantenimiento.equipo
    ? `/equipos/${mantenimiento.equipo.id}`
    : mantenimiento.infraestructura
      ? `/infraestructura/${mantenimiento.infraestructura.id}`
      : mantenimiento.activo?.clase === 'equipo'
        ? `/equipos/${mantenimiento.activo.id}`
        : mantenimiento.activo?.clase === 'infraestructura'
          ? `/infraestructura/${mantenimiento.activo.id}`
      : null

  return (
    <div className="space-y-6">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/mantenimientos" className="brand-inline-link text-sm">
            Volver a mantenimientos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Mantenimiento</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge type="mantenimiento" value={mantenimiento.tipo} />
            <span className="brand-hint text-sm">{formatDate(mantenimiento.fecha_realizacion)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/mantenimientos/${mantenimiento.id}/editar`}
            className="brand-button rounded-md px-4 py-2 text-sm font-medium"
          >
            Editar
          </Link>
          {destinoHref ? (
            <Link
              href={destinoHref}
              className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
            >
              Ver destino
            </Link>
          ) : null}
          <form action={eliminarMantenimiento.bind(null, mantenimiento.id)}>
            <ConfirmDeleteButton
              label="Eliminar"
              firstPrompt="Primera confirmación: ¿quieres eliminar este mantenimiento?"
              secondPrompt="Segunda confirmación: esta acción no se puede deshacer. ¿Eliminar mantenimiento?"
            />
          </form>
        </div>
      </div>

      <section className="brand-card rounded-lg p-5">
        <h2 className="text-lg font-semibold">Detalle</h2>
        <p className="mt-4 whitespace-pre-line text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{mantenimiento.descripcion}</p>
        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <Info label="Destino" value={destinoNombre} />
          <Info label="Área o zona" value={destinoArea} />
          <Info label="Realizado por" value={mantenimiento.realizado_por} />
          <Info label="Ejecución" value={mantenimiento.ejecucion_tipo === 'externo' ? 'Externo' : 'Interno'} />
          <Info label="Material" value={mantenimiento.requiere_material ? 'Requiere material' : 'Sin material'} />
          <Info label="Proveedor" value={mantenimiento.proveedor?.nombre} />
          <Info
            label={mantenimiento.ejecucion_tipo === 'externo' ? 'Costo del servicio' : 'Costo de material'}
            value={(mantenimiento.ejecucion_tipo === 'externo' || mantenimiento.requiere_material) && mantenimiento.costo ? `$${mantenimiento.costo}` : null}
          />
          <Info label="Fecha" value={formatDate(mantenimiento.fecha_realizacion)} />
          <Info label="Próxima fecha" value={formatDate(mantenimiento.proxima_fecha_sugerida)} />
        </dl>
        {mantenimiento.repuestos_notas ? (
          <p className="mt-4 whitespace-pre-line text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{mantenimiento.repuestos_notas}</p>
        ) : null}
        {mantenimiento.incidencia ? (
          <p className="brand-hint mt-4 text-sm">
            Ticket:{' '}
            <Link href={`/incidencias/${mantenimiento.incidencia.id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
              {mantenimiento.incidencia.ticket_numero}
            </Link>
          </p>
        ) : null}
      </section>

      <section className="brand-card rounded-lg p-5">
        <h2 className="text-lg font-semibold">Fotos</h2>
        {mantenimiento.fotos_urls.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {mantenimiento.fotos_urls.map((path) => {
              const src = fotoUrls.get(path)
              return src ? (
                <Image
                  key={path}
                  src={src}
                  alt="Foto de mantenimiento"
                  width={320}
                  height={220}
                  className="h-44 w-full rounded-md object-cover"
                />
              ) : null
            })}
          </div>
        ) : (
          <p className="brand-hint mt-4 text-sm">Sin fotos registradas.</p>
        )}
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="brand-hint">{label}</dt>
      <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{value || 'Sin dato'}</dd>
    </div>
  )
}
