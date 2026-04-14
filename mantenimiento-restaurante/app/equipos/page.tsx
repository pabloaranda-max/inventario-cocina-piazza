import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function EquiposPage() {
  const supabase = await createServerSupabaseClient()
  const { data: equipos } = await supabase
    .from('equipos')
    .select('*, proveedor:proveedores(*)')
    .order('nombre', { ascending: true })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Equipos</h1>
          <p className="text-sm text-slate-600">Maquinas e instalaciones del restaurante.</p>
        </div>
        <Link
          href="/equipos/nuevo"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Nuevo equipo
        </Link>
      </div>

      {equipos?.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(equipos as Equipo[]).map((equipo) => (
            <article
              key={equipo.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
            >
              <Link href={`/equipos/${equipo.id}`} className="block">
                <h2 className="font-semibold text-slate-950 hover:underline">{equipo.nombre}</h2>
              </Link>
              <p className="mt-1 text-sm text-slate-600">
                {equipo.area ?? 'Sin area'} · {equipo.categoria ?? 'Sin categoria'}
              </p>
              <div className="mt-3">
                <StatusBadge type="equipo" value={equipo.estado} />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Proximo: {formatDate(equipo.fecha_proximo_mantenimiento)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/incidencias/nueva?equipo=${equipo.id}`}
                  className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100"
                >
                  Reportar
                </Link>
                <Link
                  href={`/mantenimientos/nuevo?equipo=${equipo.id}`}
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Mantto.
                </Link>
                <Link
                  href={`/equipos/${equipo.id}/editar`}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  Editar
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No hay equipos registrados.
        </div>
      )}
    </div>
  )
}
