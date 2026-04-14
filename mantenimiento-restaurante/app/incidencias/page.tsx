import Image from 'next/image'
import Link from 'next/link'
import { cambiarEstadoIncidencia } from './actions'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrlMap } from '@/lib/storage'
import type { Incidencia } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

const estados = ['abierta', 'en_progreso', 'resuelta', 'cerrada']

export default async function IncidenciasPage({
  searchParams
}: {
  searchParams: Promise<{ flash?: string }>
}) {
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('incidencias')
    .select('*, equipo:equipos(id,nombre,area)')
    .order('fecha_reporte', { ascending: false })

  const incidencias = (data as Incidencia[]) ?? []
  const fotoUrls = await createSignedUrlMap(
    supabase,
    incidencias.map((incidencia) => incidencia.foto_url)
  )
  const incidenciasConFoto = incidencias.map((incidencia) => ({
    incidencia,
    foto: incidencia.foto_url ? fotoUrls.get(incidencia.foto_url) ?? null : null
  }))

  return (
    <div className="space-y-5">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Incidencias</h1>
          <p className="text-sm text-slate-600">Averias y pendientes reportados.</p>
        </div>
        <Link
          href="/incidencias/nueva"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nueva incidencia
        </Link>
      </div>

      {incidenciasConFoto.length ? (
        <div className="space-y-3">
          {incidenciasConFoto.map(({ incidencia, foto }) => (
            <article key={incidencia.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      {incidencia.ticket_numero}
                    </span>
                    <StatusBadge type="incidencia" value={incidencia.estado} />
                    <StatusBadge type="prioridad" value={incidencia.prioridad} />
                  </div>
                  <Link
                    href={`/incidencias/${incidencia.id}`}
                    className="mt-3 block font-medium text-slate-950 hover:underline"
                  >
                    {incidencia.descripcion}
                  </Link>
                  <p className="mt-2 text-sm text-slate-600">
                    {incidencia.equipo?.nombre ?? 'Sin equipo'} · {formatDate(incidencia.fecha_reporte)}
                    {incidencia.reportado_por ? ` · ${incidencia.reportado_por}` : ''}
                  </p>
                  <form action={cambiarEstadoIncidencia.bind(null, incidencia.id)} className="mt-3 flex flex-wrap gap-2">
                    <select
                      name="estado"
                      defaultValue={incidencia.estado}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      {estados.map((estado) => (
                        <option key={estado} value={estado}>
                          {estado}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                    >
                      Cambiar estado
                    </button>
                    <Link
                      href={`/incidencias/${incidencia.id}/editar`}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                    >
                      Editar
                    </Link>
                  </form>
                </div>
                {foto ? (
                  <Image
                    src={foto}
                    alt="Foto de incidencia"
                    width={160}
                    height={120}
                    className="h-32 w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-32 items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500">
                    Sin foto
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No hay incidencias registradas.
        </div>
      )}
    </div>
  )
}
