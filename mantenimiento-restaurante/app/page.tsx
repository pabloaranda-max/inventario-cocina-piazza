import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo, PrioridadIncidencia } from '@/lib/types'
import { formatDate } from '@/lib/utils'

type DashboardIncidencia = {
  id: string
  descripcion: string
  prioridad: PrioridadIncidencia
  fecha_reporte: string
  equipo: { id: string; nombre: string; area: string | null } | null
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: incidencias }, { data: vencidos }, { data: proximos }] =
    await Promise.all([
      supabase
        .from('incidencias')
        .select('id, descripcion, prioridad, estado, fecha_reporte, equipo:equipos(id,nombre,area)')
        .in('estado', ['abierta', 'en_progreso'])
        .order('fecha_reporte', { ascending: false })
        .limit(6),
      supabase
        .from('equipos')
        .select('*')
        .lt('fecha_proximo_mantenimiento', today)
        .order('fecha_proximo_mantenimiento', { ascending: true })
        .limit(6),
      supabase
        .from('equipos')
        .select('*')
        .gte('fecha_proximo_mantenimiento', today)
        .order('fecha_proximo_mantenimiento', { ascending: true })
        .limit(6)
    ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Pendientes técnicos</h1>
          <p className="text-sm text-slate-600">
            Incidencias abiertas y mantenimientos que requieren atención.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/incidencias/nueva"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Reportar incidencia
          </Link>
          <Link
            href="/mantenimientos/nuevo"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            Registrar mantenimiento
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="Incidencias abiertas" value={incidencias?.length ?? 0} />
        <SummaryCard title="Mantenimientos vencidos" value={vencidos?.length ?? 0} />
        <SummaryCard title="Próximos mantenimientos" value={proximos?.length ?? 0} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Incidencias abiertas">
          {incidencias?.length ? (
            <ul className="space-y-3">
              {(incidencias as unknown as DashboardIncidencia[]).map((incidencia) => (
                <li key={incidencia.id} className="border-b border-slate-100 pb-3 last:border-0">
                  <Link href="/incidencias" className="font-medium text-slate-950 hover:underline">
                    {incidencia.descripcion}
                  </Link>
                  <p className="mt-1 text-sm text-slate-600">
                    {incidencia.equipo?.nombre ?? 'Sin equipo'} · {incidencia.prioridad} ·{' '}
                    {formatDate(incidencia.fecha_reporte)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyText text="No hay incidencias abiertas." />
          )}
        </Panel>

        <Panel title="Mantenimientos vencidos">
          {vencidos?.length ? (
            <EquipoDateList equipos={vencidos as Equipo[]} />
          ) : (
            <EmptyText text="No hay equipos vencidos." />
          )}
        </Panel>

        <Panel title="Próximos mantenimientos">
          {proximos?.length ? (
            <EquipoDateList equipos={proximos as Equipo[]} />
          ) : (
            <EmptyText text="No hay próximos mantenimientos cargados." />
          )}
        </Panel>
      </section>
    </div>
  )
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-950">{title}</h2>
      {children}
    </div>
  )
}

function EmptyText({ text }: { text: string }) {
  return <p className="text-sm text-slate-500">{text}</p>
}

function EquipoDateList({ equipos }: { equipos: Equipo[] }) {
  return (
    <ul className="space-y-3">
      {equipos.map((equipo) => (
        <li key={equipo.id} className="border-b border-slate-100 pb-3 last:border-0">
          <Link href={`/equipos/${equipo.id}`} className="font-medium text-slate-950 hover:underline">
            {equipo.nombre}
          </Link>
          <p className="mt-1 text-sm text-slate-600">
            {equipo.area ?? 'Sin area'} · {formatDate(equipo.fecha_proximo_mantenimiento)}
          </p>
        </li>
      ))}
    </ul>
  )
}
