import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Mantenimiento } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function MantenimientosPage({
  searchParams
}: {
  searchParams: Promise<{ flash?: string }>
}) {
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase
    .from('mantenimientos')
    .select('*, equipo:equipos(id,nombre,area)')
    .order('fecha_realizacion', { ascending: false })
    .limit(100)

  const mantenimientos = (data as Mantenimiento[]) ?? []

  return (
    <div className="space-y-5">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Mantenimientos</h1>
          <p className="text-sm text-slate-600">Preventivos y correctivos registrados.</p>
        </div>
        <Link
          href="/mantenimientos/nuevo"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nuevo mantenimiento
        </Link>
      </div>

      {mantenimientos.length ? (
        <div className="space-y-3">
          {mantenimientos.map((mantenimiento) => (
            <article key={mantenimiento.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge type="mantenimiento" value={mantenimiento.tipo} />
                <span className="text-sm text-slate-600">
                  {formatDate(mantenimiento.fecha_realizacion)}
                </span>
              </div>
              <p className="mt-3 font-medium text-slate-950">{mantenimiento.descripcion}</p>
              <p className="mt-1 text-sm text-slate-600">
                {mantenimiento.equipo?.nombre ?? 'Equipo no disponible'}
                {mantenimiento.realizado_por ? ` · ${mantenimiento.realizado_por}` : ''}
                {mantenimiento.costo ? ` · $${mantenimiento.costo}` : ''}
              </p>
              {mantenimiento.proxima_fecha_sugerida ? (
                <p className="mt-1 text-sm text-slate-600">
                  Proximo: {formatDate(mantenimiento.proxima_fecha_sugerida)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No hay mantenimientos registrados.
        </div>
      )}
    </div>
  )
}
