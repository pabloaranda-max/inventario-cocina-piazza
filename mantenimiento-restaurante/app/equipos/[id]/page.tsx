import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Equipo, Incidencia, Mantenimiento } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function EquipoDetallePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ flash?: string }>
}) {
  const { id } = await params
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()
  const [
    { data: equipo },
    { data: incidencias },
    { data: mantenimientos }
  ] = await Promise.all([
    supabase.from('equipos').select('*, proveedor:proveedores(*)').eq('id', id).single(),
    supabase
      .from('incidencias')
      .select('*')
      .eq('equipo_id', id)
      .order('fecha_reporte', { ascending: false })
      .limit(8),
    supabase
      .from('mantenimientos')
      .select('*')
      .eq('equipo_id', id)
      .order('fecha_realizacion', { ascending: false })
      .limit(8)
  ])

  if (!equipo) notFound()

  const typedEquipo = equipo as Equipo
  const foto = await createSignedUrl(supabase, typedEquipo.foto_url)
  const placa = await createSignedUrl(supabase, typedEquipo.foto_placa_url)

  return (
    <div className="space-y-6">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/equipos" className="text-sm text-slate-600 hover:text-slate-950">
            Volver a equipos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{typedEquipo.nombre}</h1>
          <p className="text-sm text-slate-600">
            {typedEquipo.area ?? 'Sin area'} · {typedEquipo.categoria ?? 'Sin categoria'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/incidencias/nueva?equipo=${typedEquipo.id}`}
            className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100"
          >
            Reportar incidencia
          </Link>
          <Link
            href={`/mantenimientos/nuevo?equipo=${typedEquipo.id}`}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Registrar mantenimiento
          </Link>
          <Link
            href={`/equipos/${typedEquipo.id}/editar`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Editar
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Datos</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">Estado</dt>
              <dd className="mt-1">
                <StatusBadge type="equipo" value={typedEquipo.estado} />
              </dd>
            </div>
            <Info label="Proveedor" value={typedEquipo.proveedor?.nombre} />
            <Info label="Marca" value={typedEquipo.marca} />
            <Info label="Modelo" value={typedEquipo.modelo} />
            <Info label="Numero de serie" value={typedEquipo.numero_serie} />
            <Info label="Ultimo mantenimiento" value={formatDate(typedEquipo.fecha_ultimo_mantenimiento)} />
            <Info label="Proximo mantenimiento" value={formatDate(typedEquipo.fecha_proximo_mantenimiento)} />
          </dl>
          {typedEquipo.notas ? (
            <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{typedEquipo.notas}</p>
          ) : null}
        </div>

        <div className="space-y-4">
          <Photo title="Foto general" src={foto} />
          <Photo title="Foto de placa" src={placa} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <HistoryPanel title="Incidencias recientes">
          {incidencias?.length ? (
            <ul className="space-y-3">
              {(incidencias as Incidencia[]).map((incidencia) => (
                <li key={incidencia.id} className="border-b border-slate-100 pb-3 last:border-0">
                  <p className="font-medium text-slate-950">{incidencia.descripcion}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge type="incidencia" value={incidencia.estado} />
                    <StatusBadge type="prioridad" value={incidencia.prioridad} />
                    <span className="text-sm text-slate-600">{formatDate(incidencia.fecha_reporte)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sin incidencias registradas.</p>
          )}
        </HistoryPanel>

        <HistoryPanel title="Mantenimientos recientes">
          {mantenimientos?.length ? (
            <ul className="space-y-3">
              {(mantenimientos as Mantenimiento[]).map((mantenimiento) => (
                <li key={mantenimiento.id} className="border-b border-slate-100 pb-3 last:border-0">
                  <p className="font-medium text-slate-950">{mantenimiento.descripcion}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge type="mantenimiento" value={mantenimiento.tipo} />
                    <span className="text-sm text-slate-600">{formatDate(mantenimiento.fecha_realizacion)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Sin mantenimientos registrados.</p>
          )}
        </HistoryPanel>
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value || 'Sin dato'}</dd>
    </div>
  )
}

function Photo({ title, src }: { title: string; src: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-medium text-slate-700">{title}</h3>
      {src ? (
        <Image
          src={src}
          alt={title}
          width={260}
          height={180}
          className="h-44 w-full rounded-md object-cover"
        />
      ) : (
        <div className="flex h-44 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500">
          Sin imagen
        </div>
      )}
    </div>
  )
}

function HistoryPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-950">{title}</h2>
      {children}
    </div>
  )
}
