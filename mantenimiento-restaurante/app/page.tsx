import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Equipo, PrioridadIncidencia } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

type DashboardIncidencia = {
  id: string
  ticket_numero: string
  descripcion: string
  prioridad: PrioridadIncidencia
  estado: 'pendiente_asignacion' | 'abierta' | 'en_progreso'
  fecha_reporte: string
  reportado_por: string | null
  equipo: { id: string; nombre: string; area: string | null } | null
  zona_nombre: string | null
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const today = new Date().toISOString().slice(0, 10)
  const nextLimit = new Date()
  nextLimit.setDate(nextLimit.getDate() + 14)
  const nextLimitDate = nextLimit.toISOString().slice(0, 10)

  const [
    { data: pendientes },
    { data: urgentes },
    { data: incidencias },
    { data: vencidos },
    { data: proximos },
    { data: limpiezasAtrasadas },
    { data: proximasLimpiezas },
    { count: pendientesCount },
    { count: incidenciasCount },
    { count: urgentesCount },
    { count: vencidosCount },
    { count: cotizacionesPendientesCount },
    { count: limpiezasAtrasadasCount },
    { count: proximasLimpiezasCount }
  ] = await Promise.all([
    supabase
      .from('incidencias')
      .select('id, ticket_numero, descripcion, prioridad, estado, fecha_reporte, reportado_por, equipo:equipos(id,nombre,area), zona_nombre')
      .eq('estado', 'pendiente_asignacion')
      .order('fecha_reporte', { ascending: true })
      .limit(10),
    supabase
      .from('incidencias')
      .select('id, ticket_numero, descripcion, prioridad, estado, fecha_reporte, reportado_por, equipo:equipos(id,nombre,area), zona_nombre')
      .in('estado', ['abierta', 'en_progreso'])
      .in('prioridad', ['alta', 'urgente'])
      .order('prioridad', { ascending: false })
      .order('fecha_reporte', { ascending: true })
      .limit(6),
    supabase
      .from('incidencias')
      .select('id, ticket_numero, descripcion, prioridad, estado, fecha_reporte, reportado_por, equipo:equipos(id,nombre,area), zona_nombre')
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
      .lte('fecha_proximo_mantenimiento', nextLimitDate)
      .order('fecha_proximo_mantenimiento', { ascending: true })
      .limit(6),
    supabase
      .from('activos')
      .select('id, nombre, area, fecha_proxima_limpieza')
      .not('limpieza_intervalo_dias', 'is', null)
      .lt('fecha_proxima_limpieza', today)
      .order('fecha_proxima_limpieza', { ascending: true })
      .limit(6),
    supabase
      .from('activos')
      .select('id, nombre, area, fecha_proxima_limpieza')
      .not('limpieza_intervalo_dias', 'is', null)
      .gte('fecha_proxima_limpieza', today)
      .lte('fecha_proxima_limpieza', nextLimitDate)
      .order('fecha_proxima_limpieza', { ascending: true })
      .limit(6),
    supabase
      .from('incidencias')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente_asignacion'),
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
      .lt('fecha_proximo_mantenimiento', today),
    supabase
      .from('cotizaciones')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente_revision'),
    supabase
      .from('activos')
      .select('id', { count: 'exact', head: true })
      .not('limpieza_intervalo_dias', 'is', null)
      .lt('fecha_proxima_limpieza', today),
    supabase
      .from('activos')
      .select('id', { count: 'exact', head: true })
      .not('limpieza_intervalo_dias', 'is', null)
      .gte('fecha_proxima_limpieza', today)
      .lte('fecha_proxima_limpieza', nextLimitDate),
  ])

  return (
    <div className="space-y-6">
      {/* Mobile: incidencias-first layout */}
      <div className="md:hidden space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold dark:text-[color:var(--brand-bone)]">Centro de operación</h1>
          <Link
            href="/incidencias/nueva"
            className="brand-button rounded-md px-4 py-2 text-sm font-semibold"
          >
            Reportar
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MobileStatChip
            label="Sin asignar"
            value={pendientesCount ?? 0}
            href="/incidencias?estado=sin_asignar"
            tone="orange"
          />
          <MobileStatChip
            label="Urgentes"
            value={urgentesCount ?? 0}
            href="/incidencias?estado=activas&prioridad=alta_urgente"
            tone="red"
          />
          <MobileStatChip
            label="Activas"
            value={incidenciasCount ?? 0}
            href="/incidencias?estado=activas"
            tone="blue"
          />
          <MobileStatChip
            label="Mantto. vencidos"
            value={vencidosCount ?? 0}
            href="/equipos?mantenimiento=vencido"
            tone="yellow"
          />
        </div>

        {(pendientesCount ?? 0) > 0 && (
          <div className="brand-card rounded-lg border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] p-4 dark:border-[rgba(118,146,80,0.24)] dark:bg-[rgba(49,67,33,0.88)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold text-[#8f5a00] dark:text-[color:var(--brand-bone)]">Sin asignar</h2>
              <Link href="/incidencias?estado=sin_asignar" className="brand-inline-link text-xs font-medium">
                Ver todas
              </Link>
            </div>
            <ul className="space-y-2">
              {(pendientes as unknown as DashboardIncidencia[])?.map((inc) => (
                <li key={inc.id}>
                  <Link
                    href={`/incidencias/${inc.id}`}
                    className="brand-card block rounded-md p-3 dark:border-[rgba(118,146,80,0.18)] dark:bg-[rgba(39,54,28,0.92)]"
                  >
                    <p className="leading-snug text-[color:var(--brand-green)] dark:text-[rgba(232,239,210,0.96)]">{inc.descripcion}</p>
                    <p className="brand-hint mt-1">
                      {inc.ticket_numero} · {formatDate(inc.fecha_reporte)}
                      {inc.reportado_por ? ` · ${inc.reportado_por}` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(urgentesCount ?? 0) > 0 && (
          <div className="brand-card rounded-lg p-4 dark:border-[rgba(118,146,80,0.24)] dark:bg-[rgba(31,43,23,0.9)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold text-[color:var(--brand-wine)] dark:text-[rgba(232,239,210,0.96)]">Urgentes</h2>
              <Link href="/incidencias?estado=activas&prioridad=alta_urgente" className="brand-inline-link text-xs font-medium">
                Ver todas
              </Link>
            </div>
            <ul className="space-y-2">
              {(urgentes as unknown as DashboardIncidencia[])?.map((inc) => (
                <li key={inc.id}>
                  <Link href={`/incidencias/${inc.id}`} className="block">
                    <p className="leading-snug text-[color:var(--brand-green)] dark:text-[rgba(232,239,210,0.96)]">{inc.descripcion}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge type="prioridad" value={inc.prioridad} />
                      <span className="brand-hint">{formatDate(inc.fecha_reporte)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="brand-card rounded-lg p-4 dark:border-[rgba(118,146,80,0.24)] dark:bg-[rgba(31,43,23,0.9)]">
          <h2 className="mb-3 font-semibold dark:text-[rgba(232,239,210,0.96)]">Accesos rápidos</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/mapa" className="brand-button-muted rounded-md p-3 text-sm font-medium dark:border-[rgba(118,146,80,0.26)] dark:bg-[rgba(39,54,28,0.92)]">Mapa</Link>
            <Link href="/incidencias" className="brand-button-muted rounded-md p-3 text-sm font-medium dark:border-[rgba(118,146,80,0.26)] dark:bg-[rgba(39,54,28,0.92)]">Incidencias</Link>
            <Link href="/activos" className="brand-button-muted rounded-md p-3 text-sm font-medium dark:border-[rgba(118,146,80,0.26)] dark:bg-[rgba(39,54,28,0.92)]">Activos</Link>
            <Link href="/mantenimientos/nuevo" className="brand-button-muted rounded-md p-3 text-sm font-medium dark:border-[rgba(118,146,80,0.26)] dark:bg-[rgba(39,54,28,0.92)]">Registrar mantto.</Link>
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:block space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Centro de operación</h1>
            <p className="brand-hint text-sm">
              Entra al trabajo diario desde aquí.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/incidencias/nueva"
              className="brand-button rounded-md px-4 py-2 text-sm font-medium"
            >
              Reportar incidencia
            </Link>
            <Link
              href="/mantenimientos/nuevo"
              className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
            >
              Registrar mantenimiento
            </Link>
          </div>
        </div>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <NavigationCard
            title="Mapa operativo"
            detail="Ubica áreas, equipos e infraestructura."
            href="/mapa"
            action="Abrir mapa"
          />
          <NavigationCard
            title="Incidencias"
            detail={`${incidenciasCount ?? 0} activas. Revisa reportes abiertos y urgentes.`}
            href="/incidencias?estado=activas"
            action="Ver incidencias"
          />
          <NavigationCard
            title="Limpiezas"
            detail={`${(limpiezasAtrasadasCount ?? 0) + (proximasLimpiezasCount ?? 0)} pendientes o próximas.`}
            href={(limpiezasAtrasadasCount ?? 0) > 0 ? '/activos?limpieza=atrasadas' : '/activos?limpieza=proximas'}
            action="Dar seguimiento"
          />
          <NavigationCard
            title="Mantenimientos"
            detail={`${vencidosCount ?? 0} vencidos. Consulta programación y registra trabajos.`}
            href={(vencidosCount ?? 0) > 0 ? '/equipos?mantenimiento=vencido' : '/mantenimientos'}
            action="Ver mantenimiento"
          />
          <NavigationCard
            title="Activos"
            detail="Equipos, infraestructura y elementos mantenibles."
            href="/activos"
            action="Abrir activos"
          />
          <NavigationCard
            title="Cotizaciones"
            detail={`${cotizacionesPendientesCount ?? 0} pendientes de decisión.`}
            href="/cotizaciones?estado=pendiente_revision"
            action="Revisar cotizaciones"
          />
          <NavigationCard
            title="Proveedores"
            detail="Contactos, especialidades y notas de servicio."
            href="/proveedores"
            action="Abrir proveedores"
          />
          <NavigationCard
            title="Nuevo reporte"
            detail="Captura rápida desde piso."
            href="/incidencias/nueva"
            action="Reportar ahora"
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <SummaryCard
            title="Sin asignar"
            value={pendientesCount ?? 0}
            detail="Requieren tu revisión"
            hoverSummary="Reportes nuevos que aún no tienen activo o zona asignada. Entra para revisar y confirmar cada uno."
            href="/incidencias?estado=sin_asignar"
            tone="orange"
          />
          <SummaryCard
            title="Urgentes"
            value={urgentesCount ?? 0}
            detail="Alta o urgente, abiertas"
            hoverSummary="Incidencias activas con prioridad alta o urgente. Entra para decidir qué se atiende primero."
            href="/incidencias?estado=activas&prioridad=alta_urgente"
            tone="red"
          />
          <SummaryCard
            title="Mantenimientos vencidos"
            value={vencidosCount ?? 0}
            detail="Fecha programada pasada"
            hoverSummary="Equipos con mantenimiento preventivo vencido. Entra para registrar el trabajo o ajustar la programación."
            href="/equipos?mantenimiento=vencido"
            tone="yellow"
          />
          <SummaryCard
            title="Incidencias activas"
            value={incidenciasCount ?? 0}
            detail="Abiertas o en progreso"
            hoverSummary="Todos los reportes abiertos o en trabajo. Entra para cambiar estado, editar o registrar seguimiento."
            href="/incidencias?estado=activas"
            tone="blue"
          />
          <SummaryCard
            title="Limpiezas atrasadas"
            value={limpiezasAtrasadasCount ?? 0}
            detail="Fecha de limpieza pasada"
            hoverSummary="Activos con limpieza profunda vencida. Entra para registrar limpieza y recalcular la próxima fecha."
            href="/activos?limpieza=atrasadas"
            tone="teal"
          />
          <SummaryCard
            title="Cotizaciones pendientes"
            value={cotizacionesPendientesCount ?? 0}
            detail="Pendientes de revisión"
            hoverSummary="Cotizaciones recibidas que todavía necesitan decisión. Entra para aprobar, rechazar o revisar archivo."
            href="/cotizaciones?estado=pendiente_revision"
            tone="violet"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          {(pendientesCount ?? 0) > 0 ? (
            <Panel title={`Sin asignar · ${pendientesCount}`} tone="orange">
              <ul className="space-y-3">
                {(pendientes as unknown as DashboardIncidencia[])?.map((inc) => (
                  <li key={inc.id} className="border-b border-orange-100 pb-3 last:border-0 dark:border-orange-900">
                    <Link href={`/incidencias/${inc.id}`} className="font-medium text-[color:var(--brand-ink)] hover:underline">
                      {inc.descripcion}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] px-2 py-0.5 text-xs font-medium text-[color:var(--brand-olive)]">
                        {inc.ticket_numero}
                      </span>
                      <StatusBadge type="prioridad" value={inc.prioridad} />
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--brand-muted)]">
                      {formatDate(inc.fecha_reporte)}
                      {inc.reportado_por ? ` · ${inc.reportado_por}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <Link
                href="/incidencias?estado=sin_asignar"
                className="mt-3 block text-xs font-medium text-orange-700 hover:underline dark:text-orange-400"
              >
                Ver todas sin asignar →
              </Link>
            </Panel>
          ) : (
            <Panel title="Sin asignar">
              <p className="text-sm text-[color:var(--brand-muted)]">No hay reportes sin asignar.</p>
            </Panel>
          )}

          <Panel title="Urgentes ahora">
            {urgentes?.length ? (
              <ul className="space-y-3">
                {(urgentes as unknown as DashboardIncidencia[]).map((incidencia) => (
                  <li key={incidencia.id} className="border-b border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] pb-3 last:border-0">
                    <Link
                      href={`/incidencias/${incidencia.id}`}
                      className="font-medium text-[color:var(--brand-ink)] hover:underline"
                    >
                      {incidencia.descripcion}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-olive)]">
                        {incidencia.ticket_numero}
                      </span>
                      <StatusBadge type="prioridad" value={incidencia.prioridad} />
                      <StatusBadge type="incidencia" value={incidencia.estado} />
                    </div>
                    <p className="mt-2 text-sm text-[color:var(--brand-muted)]">
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

          <Panel title="Limpiezas atrasadas">
            {limpiezasAtrasadas?.length ? (
              <ActivoLimpiezaList activos={limpiezasAtrasadas as Pick<Activo, 'id' | 'nombre' | 'area' | 'fecha_proxima_limpieza'>[]} today={today} />
            ) : (
              <EmptyText text="No hay limpiezas atrasadas." />
            )}
          </Panel>
        </section>

        <Panel title="Incidencias abiertas">
          {incidencias?.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {(incidencias as unknown as DashboardIncidencia[]).map((incidencia) => (
                <li
                  key={incidencia.id}
                  className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_72%,white)] p-3"
                >
                  <Link
                    href={`/incidencias/${incidencia.id}`}
                    className="font-medium text-[color:var(--brand-ink)] hover:underline"
                  >
                    {incidencia.descripcion}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-olive)]">
                      {incidencia.ticket_numero}
                    </span>
                    <StatusBadge type="incidencia" value={incidencia.estado} />
                    <StatusBadge type="prioridad" value={incidencia.prioridad} />
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--brand-muted)]">
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
    </div>
  )
}

function MobileStatChip({
  label, value, href, tone
}: {
  label: string
  value: number
  href: string
  tone: 'orange' | 'red' | 'blue' | 'yellow'
}) {
  const cls = {
    orange: 'border-orange-200 bg-orange-50 text-orange-900 dark:border-[rgba(239,169,30,0.22)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]',
    red: 'border-[rgba(155,30,33,0.2)] bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)] dark:border-[rgba(155,30,33,0.24)] dark:bg-[rgba(155,30,33,0.2)] dark:text-[color:var(--brand-bone)]',
    blue: 'border-[rgba(47,62,30,0.18)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(39,54,28,0.9)] dark:text-[rgba(232,239,210,0.96)]',
    yellow: 'border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] text-[#8f5a00] dark:border-[rgba(239,169,30,0.22)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]'
  }[tone]

  return (
    <Link href={href} className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </Link>
  )
}

function NavigationCard({
  title,
  detail,
  href,
  action
}: {
  title: string
  detail: string
  href: string
  action: string
}) {
  return (
    <Link
      href={href}
      className="brand-card group rounded-lg p-4 transition hover:-translate-y-0.5 hover:border-[rgba(239,169,30,0.28)] hover:shadow-md"
    >
      <div className="flex h-full flex-col justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="brand-hint mt-2 text-sm leading-5">{detail}</p>
        </div>
        <span className="text-sm font-medium text-[color:var(--brand-wine)] group-hover:underline dark:text-[color:var(--brand-yellow)]">{action}</span>
      </div>
    </Link>
  )
}

function SummaryCard({
  title,
  value,
  detail,
  hoverSummary,
  href,
  tone
}: {
  title: string
  value: number
  detail: string
  hoverSummary: string
  href: string
  tone: 'red' | 'yellow' | 'blue' | 'teal' | 'violet' | 'green' | 'orange'
}) {
  const toneClass = {
    green: 'border-[rgba(47,62,30,0.18)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(39,54,28,0.9)] dark:text-[rgba(232,239,210,0.96)]',
    red: 'border-[rgba(155,30,33,0.18)] bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)] dark:border-[rgba(155,30,33,0.24)] dark:bg-[rgba(79,25,26,0.84)] dark:text-[rgba(244,236,218,0.96)]',
    yellow: 'border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] text-[#8f5a00] dark:border-[rgba(239,169,30,0.22)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]',
    blue: 'border-[rgba(47,62,30,0.18)] bg-[rgba(238,227,202,0.74)] text-[color:var(--brand-green)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(39,54,28,0.9)] dark:text-[rgba(232,239,210,0.96)]',
    teal: 'border-[rgba(47,62,30,0.18)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(101,127,68,0.24)] dark:bg-[rgba(49,67,33,0.9)] dark:text-[rgba(232,239,210,0.96)]',
    violet: 'border-[rgba(155,30,33,0.16)] bg-[rgba(239,169,30,0.1)] text-[color:var(--brand-wine)] dark:border-[rgba(155,30,33,0.22)] dark:bg-[rgba(79,25,26,0.82)] dark:text-[rgba(244,236,218,0.96)]',
    orange: 'border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] text-[#8f5a00] dark:border-[rgba(239,169,30,0.22)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]'
  }[tone]

  return (
    <Link
      href={href}
      className={`group relative block rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm">{detail}</p>
      <p className="brand-card pointer-events-none absolute left-3 right-3 top-full z-20 mt-2 hidden rounded-md p-3 text-xs leading-5 text-[color:var(--brand-green)] shadow-lg group-hover:block group-focus:block dark:text-[color:var(--brand-bone)]">
        {hoverSummary}
      </p>
    </Link>
  )
}

function Panel({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'orange' }) {
  const borderClass = tone === 'orange'
    ? 'border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(239,169,30,0.14)]'
    : 'brand-card'
  const titleClass = tone === 'orange'
    ? 'text-[#8f5a00] dark:text-[#ffd982]'
    : ''

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${borderClass}`}>
      <h2 className={`mb-4 text-lg font-semibold ${titleClass}`}>{title}</h2>
      {children}
    </div>
  )
}

function EmptyText({ text }: { text: string }) {
  return <p className="brand-hint text-sm">{text}</p>
}

function EquipoDateList({ equipos }: { equipos: Equipo[] }) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <ul className="space-y-3">
      {equipos.map((equipo) => (
        <li key={equipo.id} className="border-b border-[rgba(47,62,30,0.08)] pb-3 last:border-0 dark:border-[rgba(238,227,202,0.08)]">
          <Link href={`/equipos/${equipo.id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
            {equipo.nombre}
          </Link>
          <p className="brand-hint mt-1 text-sm">
            {equipo.area ?? 'Sin area'} · {formatDate(equipo.fecha_proximo_mantenimiento)}
          </p>
          <p className="brand-hint mt-1 text-xs font-medium">
            {dateDistance(equipo.fecha_proximo_mantenimiento, today)}
          </p>
        </li>
      ))}
    </ul>
  )
}

function ActivoLimpiezaList({
  activos,
  today
}: {
  activos: Pick<Activo, 'id' | 'nombre' | 'area' | 'fecha_proxima_limpieza'>[]
  today: string
}) {
  return (
    <ul className="space-y-3">
      {activos.map((activo) => (
        <li key={activo.id} className="border-b border-[rgba(47,62,30,0.08)] pb-3 last:border-0 dark:border-[rgba(238,227,202,0.08)]">
          <Link href={`/activos/${activo.id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
            {activo.nombre}
          </Link>
          <p className="brand-hint mt-1 text-sm">
            {activo.area ?? 'Sin área'} · {formatDate(activo.fecha_proxima_limpieza)}
          </p>
          <p className="mt-1 text-xs font-medium text-[color:var(--brand-wine)] dark:text-[color:var(--brand-yellow)]">
            {dateDistance(activo.fecha_proxima_limpieza, today)}
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
