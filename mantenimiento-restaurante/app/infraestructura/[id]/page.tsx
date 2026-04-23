import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Activo, Incidencia, Infraestructura, Mantenimiento } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function InfraestructuraDetallePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ flash?: string }>
}) {
  const { id } = await params
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()
  const [{ data }, { data: incidencias }, { data: mantenimientos }, { data: activo }] = await Promise.all([
    supabase
      .from('infraestructura')
      .select('*, proveedor:proveedores(*), nivel:mapa_niveles(id,nombre)')
      .eq('id', id)
      .single(),
    supabase
      .from('incidencias')
      .select('*')
      .eq('infraestructura_id', id)
      .order('fecha_reporte', { ascending: false })
      .limit(8),
    supabase
      .from('mantenimientos')
      .select('*')
      .eq('infraestructura_id', id)
      .order('fecha_realizacion', { ascending: false })
      .limit(8),
    supabase
      .from('activos')
      .select('limpieza_intervalo_dias,limpieza_tipo,limpieza_proveedor_id,fecha_ultima_limpieza,fecha_proxima_limpieza,limpieza_proveedor:proveedores!limpieza_proveedor_id(nombre)')
      .eq('id', id)
      .single()
  ])

  if (!data) notFound()

  const infraestructura = data as Infraestructura
  const limpiezaData = activo as (Pick<Activo, 'limpieza_intervalo_dias' | 'limpieza_tipo' | 'limpieza_proveedor_id' | 'fecha_ultima_limpieza' | 'fecha_proxima_limpieza'> & { limpieza_proveedor?: { nombre: string } | null }) | null
  const foto = await createSignedUrl(supabase, infraestructura.foto_url)

  return (
    <div className="space-y-6">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/infraestructura" className="brand-inline-link text-sm">
            Volver a infraestructura
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{infraestructura.nombre}</h1>
          <p className="brand-hint text-sm">
            {infraestructura.area ?? 'Sin área'} · {infraestructura.tipo}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/incidencias/nueva?infraestructura=${infraestructura.id}`}
            className="rounded-md border border-[rgba(155,30,33,0.2)] bg-[rgba(155,30,33,0.08)] px-4 py-2 text-sm font-medium text-[color:var(--brand-wine)] hover:bg-[rgba(155,30,33,0.12)] dark:border-[rgba(155,30,33,0.24)] dark:bg-[rgba(155,30,33,0.18)] dark:text-[color:var(--brand-bone)]"
          >
            Reportar incidencia
          </Link>
          <Link
            href={`/mantenimientos/nuevo?infraestructura=${infraestructura.id}`}
            className="rounded-md border border-[rgba(47,62,30,0.16)] bg-[rgba(47,62,30,0.08)] px-4 py-2 text-sm font-medium text-[color:var(--brand-green)] hover:bg-[rgba(47,62,30,0.12)] dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.2)] dark:text-[color:var(--brand-bone)]"
          >
            Registrar mantenimiento
          </Link>
          <Link
            href={`/activos/${infraestructura.id}/ubicacion`}
            className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
          >
            Ubicar en mapa
          </Link>
          <Link
            href={`/infraestructura/${infraestructura.id}/editar`}
            className="brand-button rounded-md px-4 py-2 text-sm font-medium"
          >
            Editar
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="brand-card rounded-lg p-5">
          <h2 className="text-lg font-semibold">Datos</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="brand-hint">Estado</dt>
              <dd className="mt-1">
                <StatusBadge type="infraestructura" value={infraestructura.estado} />
              </dd>
            </div>
            <div>
              <dt className="brand-hint">Criticidad</dt>
              <dd className="mt-1">
                <StatusBadge type="criticidad" value={infraestructura.criticidad} />
              </dd>
            </div>
            <Info label="Proveedor" value={infraestructura.proveedor?.nombre} />
            <Info label="Lámina" value={infraestructura.nivel?.nombre} />
            <Info label="X" value={infraestructura.x?.toString()} />
            <Info label="Y" value={infraestructura.y?.toString()} />
            <Info label="Última revisión" value={formatDate(infraestructura.fecha_ultima_revision)} />
            <Info label="Próxima revisión" value={formatDate(infraestructura.fecha_proxima_revision)} />
          </dl>
          {limpiezaData?.limpieza_intervalo_dias && (
            <div className="brand-card mt-4 rounded-md border-[rgba(47,62,30,0.16)] bg-[rgba(238,227,202,0.72)] p-3 dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.18)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="brand-hint text-xs font-medium uppercase tracking-wide">Limpieza profunda calendarizada</p>
                {limpiezaData.limpieza_tipo === 'contratado' && (
                  <Link
                    href={`/cotizaciones/nueva?activo=${id}${limpiezaData.limpieza_proveedor_id ? `&proveedor=${limpiezaData.limpieza_proveedor_id}` : ''}`}
                    className="brand-button-muted rounded px-2 py-1 text-xs font-medium"
                  >
                    + Cotización de limpieza
                  </Link>
                )}
              </div>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <dt className="brand-hint">Tipo</dt>
                  <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
                    {limpiezaData.limpieza_tipo === 'contratado' ? 'Servicio contratado' : 'Proceso interno'}
                  </dd>
                </div>
                {limpiezaData.limpieza_tipo === 'contratado' && (
                  <div>
                    <dt className="brand-hint">Proveedor</dt>
                    <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{limpiezaData.limpieza_proveedor?.nombre ?? '—'}</dd>
                  </div>
                )}
                <div>
                  <dt className="brand-hint">Intervalo</dt>
                  <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">Cada {limpiezaData.limpieza_intervalo_dias} días</dd>
                </div>
                <div>
                  <dt className="brand-hint">Última limpieza</dt>
                  <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{formatDate(limpiezaData.fecha_ultima_limpieza)}</dd>
                </div>
                <div>
                  <dt className="brand-hint">Próxima limpieza</dt>
                  <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{formatDate(limpiezaData.fecha_proxima_limpieza)}</dd>
                </div>
              </dl>
            </div>
          )}
          {infraestructura.descripcion_ubicacion ? (
            <p className="mt-4 whitespace-pre-line text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{infraestructura.descripcion_ubicacion}</p>
          ) : null}
          {infraestructura.notas ? (
            <p className="mt-4 whitespace-pre-line text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{infraestructura.notas}</p>
          ) : null}
        </div>

        <div className="brand-card rounded-lg p-3">
          <h2 className="brand-label mb-2">Foto</h2>
          {foto ? (
            <Image
              src={foto}
              alt={infraestructura.nombre}
              width={320}
              height={240}
              className="h-60 w-full rounded-md object-cover"
            />
          ) : (
            <div className="brand-hint flex h-60 items-center justify-center rounded-md bg-[rgba(47,62,30,0.06)] dark:bg-[rgba(238,227,202,0.08)]">
              Sin foto
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <HistoryPanel title="Incidencias recientes">
          {incidencias?.length ? (
            <ul className="space-y-3">
              {(incidencias as Incidencia[]).map((incidencia) => (
                <li key={incidencia.id} className="border-b border-[rgba(47,62,30,0.08)] pb-3 last:border-0 dark:border-[rgba(238,227,202,0.08)]">
                  <Link href={`/incidencias/${incidencia.id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
                    {incidencia.ticket_numero} · {incidencia.descripcion}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge type="incidencia" value={incidencia.estado} />
                    <StatusBadge type="prioridad" value={incidencia.prioridad} />
                    <span className="brand-hint text-sm">{formatDate(incidencia.fecha_reporte)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="brand-hint text-sm">Sin incidencias registradas.</p>
          )}
        </HistoryPanel>

        <HistoryPanel title="Mantenimientos recientes">
          {mantenimientos?.length ? (
            <ul className="space-y-3">
              {(mantenimientos as Mantenimiento[]).map((mantenimiento) => (
                <li key={mantenimiento.id} className="border-b border-[rgba(47,62,30,0.08)] pb-3 last:border-0 dark:border-[rgba(238,227,202,0.08)]">
                  <Link
                    href={`/mantenimientos/${mantenimiento.id}`}
                    className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]"
                  >
                    {mantenimiento.descripcion}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge type="mantenimiento" value={mantenimiento.tipo} />
                    <span className="brand-hint text-sm">{formatDate(mantenimiento.fecha_realizacion)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="brand-hint text-sm">Sin mantenimientos registrados.</p>
          )}
        </HistoryPanel>
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

function HistoryPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="brand-card rounded-lg p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  )
}
