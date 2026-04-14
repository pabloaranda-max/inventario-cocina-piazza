import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Incidencia } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function IncidenciaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('incidencias')
    .select('*, equipo:equipos(id,nombre,area)')
    .eq('id', id)
    .single()

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
            <StatusBadge type="incidencia" value={incidencia.estado} />
            <StatusBadge type="prioridad" value={incidencia.prioridad} />
          </div>
        </div>
        {incidencia.equipo ? (
          <Link
            href={`/equipos/${incidencia.equipo.id}`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Ver equipo
          </Link>
        ) : null}
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
