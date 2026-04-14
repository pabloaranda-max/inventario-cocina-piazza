import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo, PrioridadIncidencia } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

type DashboardIncidencia = {
  id: string
  descripcion: string
  prioridad: PrioridadIncidencia
  estado: 'abierta' | 'en_progreso'
  fecha_reporte: string
  equipo: { id: string; nombre: string; area: string | null } | null
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const today = new Date().toISOString().slice(0, 10)
  const nextLimit = new Date()
  nextLimit.setDate(nextLimit.getDate() + 14)
  const nextLimitDate = nextLimit.toISOString().slice(0, 10)

  const [
    { data: incidencias },
    { data: urgentes },
    { data: vencidos },
    { data: proximos },
    { count: incidenciasCount },
    { count: urgentesCount },
    { count: vencidosCount }
  ] =
    await Promise.all([
      supabase
        .from('incidencias')
        .select('id, descripcion, prioridad, estado, fecha_reporte, equipo:equipos(id,nombre,area)')
        .in('estado', ['abierta', 'en_progreso'])
        .order('fecha_reporte', { ascending: false })
        .limit(6),
      supabase
        .from('incidencias')
        .select('id, descripcion, prioridad, estado, fecha_reporte, equipo:equipos(id,nombre,area)')
        .in('estado', ['abierta', 'en_progreso'])
        .in('prioridad', ['alta', 'urgente'])
        .order('prioridad', { ascending: false })
        .order('fecha_reporte', { ascending: true })
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
        .lte('fecha_proximo_mantenimiento', nextLimitDate)
        .order('fecha_proximo_mantenimiento', { ascending: true })
        .limit(6),
      supabase
        .from('incidencias')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['abierta', 'en_progreso']),
      supabase
        .from('incidencias')
        .select('id', { count: 'exact', head: true })
        .in('estado', ['abierta', 'en_progreso'])
        .in('prioridad', ['alta', 'urgente']),
      supabase
        .from('equipos')
        .select('id', { count: 'exact', head: true })
        .lt('fecha_proximo_mantenimiento', today)
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
        <SummaryCard
          title="Urgentes"
          value={urgentesCount ?? 0}
          detail="Alta o urgente, abiertas"
          tone="red"
        />
        <SummaryCard
          title="Mantenimientos vencidos"
          value={vencidosCount ?? 0}
          detail="Fecha programada pasada"
          tone="yellow"
        />
        <SummaryCard
          title="Incidencias activas"
          value={incidenciasCount ?? 0}
          detail="Abiertas o en progreso"
          tone="blue"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Urgentes ahora">
          {urgentes?.length ? (
            <ul className="space-y-3">
              {(urgentes as unknown as DashboardIncidencia[]).map((incidencia) => (
                <li key={incidencia.id} className="border-b border-slate-100 pb-3 last:border-0">
                  <Link
                    href={`/incidencias/${incidencia.id}`}
                    className="font-medium text-slate-950 hover:underline"
                  >
                    {incidencia.descripcion}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge type="prioridad" value={incidencia.prioridad} />
                    <StatusBadge type="incidencia" value={incidencia.estado} />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {incidencia.equipo?.nombre ?? 'Sin equipo'} · {formatDate(incidencia.fecha_reporte)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyText text="No hay incidencias urgentes." />
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

      <Panel title="Incidencias abiertas">
        {incidencias?.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {(incidencias as unknown as DashboardIncidencia[]).map((incidencia) => (
              <li key={incidencia.id} className="rounded-md border border-slate-200 p-3">
                <Link
                  href={`/incidencias/${incidencia.id}`}
                  className="font-medium text-slate-950 hover:underline"
                >
                  {incidencia.descripcion}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge type="incidencia" value={incidencia.estado} />
                  <StatusBadge type="prioridad" value={incidencia.prioridad} />
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {incidencia.equipo?.nombre ?? 'Sin equipo'} · {formatDate(incidencia.fecha_reporte)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyText text="No hay incidencias abiertas." />
        )}
      </Panel>
    </div>
  )
}

function SummaryCard({
  title,
  value,
  detail,
  tone
}: {
  title: string
  value: number
  detail: string
  tone: 'red' | 'yellow' | 'blue'
}) {
  const toneClass = {
    red: 'border-rose-200 bg-rose-50 text-rose-800',
    yellow: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-sky-200 bg-sky-50 text-sky-800'
  }[tone]

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm">{detail}</p>
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
  const today = new Date().toISOString().slice(0, 10)

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
          <p className="mt-1 text-xs font-medium text-slate-500">
            {dateDistance(equipo.fecha_proximo_mantenimiento, today)}
          </p>
        </li>
      ))}
    </ul>
  )
}

function dateDistance(date: string | null, today: string) {
  if (!date) return 'Sin fecha programada'

  const diff = Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86_400_000
  )

  if (diff < 0) return `Vencido hace ${Math.abs(diff)} día${Math.abs(diff) === 1 ? '' : 's'}`
  if (diff === 0) return 'Vence hoy'
  return `En ${diff} día${diff === 1 ? '' : 's'}`
}
