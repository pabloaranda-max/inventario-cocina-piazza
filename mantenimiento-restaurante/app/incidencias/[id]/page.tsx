import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Incidencia, Mantenimiento } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function IncidenciaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data }, { data: mantenimientos }] = await Promise.all([
    supabase.from('incidencias').select('*, equipo:equipos(id,nombre,area)').eq('id', id).single(),
    supabase
      .from('mantenimientos')
      .select('*')
      .eq('incidencia_id', id)
      .order('fecha_realizacion', { ascending: false })
  ])

  if (!data) notFound()

  const incidencia = data as Incidencia
  const foto = await createSignedUrl(supabase, incidencia.foto_url)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/incidencias" className="text-sm text-slate-600 hover:text-slate-950">
            Volver a incidencias
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">Incidencia</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              {incidencia.ticket_numero}
            </span>
            <StatusBadge type="incidencia" value={incidencia.estado} />
            <StatusBadge type="prioridad" value={incidencia.prioridad} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/incidencias/${incidencia.id}/editar`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Editar incidencia
          </Link>
          {incidencia.equipo ? (
            <Link
              href={`/mantenimientos/nuevo?equipo=${incidencia.equipo.id}&incidencia=${incidencia.id}`}
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Mandar a mantenimiento
            </Link>
          ) : null}
          {incidencia.equipo ? (
          <Link
            href={`/equipos/${incidencia.equipo.id}`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Ver equipo
          </Link>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Detalle</h2>
          <p className="mt-4 whitespace-pre-line text-slate-800">{incidencia.descripcion}</p>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <Info label="Equipo" value={incidencia.equipo?.nombre ?? 'Sin equipo'} />
            <Info label="Area" value={incidencia.equipo?.area} />
            <Info label="Reportado por" value={incidencia.reportado_por} />
            <Info label="Fecha" value={formatDate(incidencia.fecha_reporte)} />
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-medium text-slate-700">Foto</h2>
          {foto ? (
            <Image
              src={foto}
              alt="Foto de incidencia"
              width={320}
              height={240}
              className="h-60 w-full rounded-md object-cover"
            />
          ) : (
            <div className="flex h-60 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500">
              Sin foto
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Mantenimientos vinculados</h2>
        {mantenimientos?.length ? (
          <ul className="mt-4 space-y-3">
            {(mantenimientos as Mantenimiento[]).map((mantenimiento) => (
              <li key={mantenimiento.id} className="border-b border-slate-100 pb-3 last:border-0">
                <p className="font-medium text-slate-950">{mantenimiento.descripcion}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {mantenimiento.tipo} · {formatDate(mantenimiento.fecha_realizacion)}
                  {mantenimiento.realizado_por ? ` · ${mantenimiento.realizado_por}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Sin mantenimientos vinculados.</p>
        )}
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
