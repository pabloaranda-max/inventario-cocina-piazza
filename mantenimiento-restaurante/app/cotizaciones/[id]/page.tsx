import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eliminarCotizacion, cambiarEstadoCotizacion } from '../actions'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Cotizacion, EstadoCotizacion } from '@/lib/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button'

export default async function CotizacionDetallePage({
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
    .from('cotizaciones')
    .select('*, proveedor:proveedores(id,nombre,especialidad), activo:activos(id,nombre,area,clase,tipo), incidencia:incidencias(id,ticket_numero,descripcion), mantenimiento:mantenimientos(id,tipo,fecha_realizacion)')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const cotizacion = data as Cotizacion
  const archivoUrl = await createSignedUrl(supabase, cotizacion.archivo_url)

  const estadosBotones: { valor: EstadoCotizacion; label: string; clase: string }[] = [
    {
      valor: 'pendiente_revision',
      label: 'Pendiente',
      clase: cotizacion.estado === 'pendiente_revision'
        ? 'border-[color:var(--brand-gold)] bg-[color:color-mix(in_srgb,var(--brand-gold)_24%,white)] text-[color:var(--brand-olive)]'
        : 'border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-muted)] hover:bg-[color:color-mix(in_srgb,var(--brand-gold)_12%,white)]'
    },
    {
      valor: 'aprobada',
      label: 'Aprobar',
      clase: cotizacion.estado === 'aprobada'
        ? 'border-[color:var(--brand-olive)] bg-[color:color-mix(in_srgb,var(--brand-olive)_18%,white)] text-[color:var(--brand-olive)]'
        : 'border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-muted)] hover:bg-[color:color-mix(in_srgb,var(--brand-olive)_12%,white)]'
    },
    {
      valor: 'rechazada',
      label: 'Rechazar',
      clase: cotizacion.estado === 'rechazada'
        ? 'border-[color:var(--brand-wine)] bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)] text-[color:var(--brand-wine)]'
        : 'border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-muted)] hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_12%,white)]'
    },
  ]

  return (
    <div className="space-y-6">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/cotizaciones" className="brand-inline-link text-sm">
            Volver a cotizaciones
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {cotizacion.numero}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/cotizaciones/${id}/editar`}
            className="brand-button rounded-md px-3 py-2 text-sm font-medium"
          >
            Editar
          </Link>
          <form action={eliminarCotizacion.bind(null, id)}>
            <ConfirmDeleteButton
              label="Eliminar"
              firstPrompt="Primera confirmación: ¿quieres eliminar esta cotización?"
              secondPrompt="Segunda confirmación: esta acción no se puede deshacer. ¿Eliminar cotización?"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900"
            />
          </form>
        </div>
      </div>

      {/* Cambio de estado rápido */}
      <section className="brand-card rounded-lg p-4">
        <p className="brand-label mb-3">Estado de la cotización</p>
        <div className="flex flex-wrap gap-2">
          {estadosBotones.map((btn) => (
            <form key={btn.valor} action={cambiarEstadoCotizacion.bind(null, id, btn.valor)}>
              <button
                type="submit"
                disabled={cotizacion.estado === btn.valor}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-default ${btn.clase}`}
              >
                {cotizacion.estado === btn.valor ? <StatusBadge type="cotizacion" value={btn.valor} /> : btn.label}
              </button>
            </form>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Monto">
          {cotizacion.monto != null ? formatCurrency(cotizacion.monto, cotizacion.moneda) : '—'}
        </Field>
        <Field label="Fecha de emisión">{formatDate(cotizacion.fecha_emision)}</Field>
        {cotizacion.fecha_vencimiento && (
          <Field label="Válida hasta">{formatDate(cotizacion.fecha_vencimiento)}</Field>
        )}
      </div>

      {cotizacion.proveedor && (
        <section className="brand-card rounded-lg p-4">
          <h2 className="mb-2 text-base font-semibold">Proveedor</h2>
          <p className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{cotizacion.proveedor.nombre}</p>
          {cotizacion.proveedor.especialidad && (
            <p className="brand-hint mt-1 text-sm">{cotizacion.proveedor.especialidad}</p>
          )}
        </section>
      )}

      {cotizacion.activo && (
        <section className="brand-card rounded-lg p-4">
          <h2 className="mb-2 text-base font-semibold">Activo relacionado</h2>
          <Link href={`/activos/${cotizacion.activo_id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
            {cotizacion.activo.nombre}
          </Link>
          <p className="brand-hint mt-1 text-sm">
            {cotizacion.activo.area ?? 'Sin zona'} · {cotizacion.activo.tipo}
          </p>
        </section>
      )}

      {cotizacion.incidencia && (
        <section className="brand-card rounded-lg p-4">
          <h2 className="mb-2 text-base font-semibold">Incidencia relacionada</h2>
          <Link href={`/incidencias/${cotizacion.incidencia_id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
            {cotizacion.incidencia.ticket_numero}
          </Link>
          <p className="brand-hint mt-1 text-sm">{cotizacion.incidencia.descripcion}</p>
        </section>
      )}

      {cotizacion.mantenimiento && (
        <section className="brand-card rounded-lg p-4">
          <h2 className="mb-2 text-base font-semibold">Mantenimiento relacionado</h2>
          <Link href={`/mantenimientos/${cotizacion.mantenimiento_id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
            {cotizacion.mantenimiento.tipo} — {formatDate(cotizacion.mantenimiento.fecha_realizacion)}
          </Link>
        </section>
      )}

      {cotizacion.notas && (
        <section className="brand-card rounded-lg p-4">
          <h2 className="mb-2 text-base font-semibold">Notas</h2>
          <p className="text-sm whitespace-pre-wrap text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{cotizacion.notas}</p>
        </section>
      )}

      {archivoUrl && (
        <section className="brand-card rounded-lg p-4">
          <h2 className="mb-3 text-base font-semibold">Archivo adjunto</h2>
          {cotizacion.archivo_url?.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
            <a href={archivoUrl} target="_blank" rel="noopener noreferrer">
              <Image
                src={archivoUrl}
                alt="Archivo cotización"
                width={640}
                height={480}
                className="max-w-sm rounded-md border border-[color:var(--brand-border)]"
              />
            </a>
          ) : (
            <a
              href={archivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="brand-button-muted inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
            >
              Ver / descargar archivo
            </a>
          )}
        </section>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="brand-hint text-xs font-medium uppercase tracking-wide">{label}</p>
      <div className="mt-1 text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{children}</div>
    </div>
  )
}
