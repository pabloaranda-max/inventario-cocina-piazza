import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo } from '@/lib/types'
import { formatDate } from '@/lib/utils'

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
            <Link
              key={equipo.id}
              href={`/equipos/${equipo.id}`}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-400"
            >
              <h2 className="font-semibold text-slate-950">{equipo.nombre}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {equipo.area ?? 'Sin area'} · {equipo.categoria ?? 'Sin categoria'}
              </p>
              <p className="mt-2 text-sm text-slate-700">Estado: {equipo.estado}</p>
              <p className="text-sm text-slate-600">
                Proximo: {formatDate(equipo.fecha_proximo_mantenimiento)}
              </p>
            </Link>
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
