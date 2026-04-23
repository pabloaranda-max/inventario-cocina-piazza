import Link from 'next/link'
import { GlobalSearchForm } from '@/components/layout/global-search-form'
import { StatusBadge } from '@/components/ui/status-badge'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Incidencia, Mantenimiento, Proveedor } from '@/lib/types'
import { formatDate, formatDateTime } from '@/lib/utils'

const MIN_QUERY_LENGTH = 2
const RESULT_LIMIT = 8

type SearchParams = Promise<{ q?: string }>

type SearchActivo = Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo' | 'estado'>
type SearchIncidencia = Pick<Incidencia, 'id' | 'ticket_numero' | 'descripcion' | 'prioridad' | 'estado' | 'fecha_reporte' | 'zona_nombre'> & {
  activo?: Pick<Activo, 'id' | 'nombre' | 'clase'> | null
  equipo?: { id: string; nombre: string } | null
  infraestructura?: { id: string; nombre: string; tipo: string | null } | null
}
type SearchMantenimiento = Pick<Mantenimiento, 'id' | 'descripcion' | 'tipo' | 'fecha_realizacion' | 'realizado_por' | 'zona_nombre'> & {
  activo?: Pick<Activo, 'id' | 'nombre' | 'clase'> | null
  equipo?: { id: string; nombre: string } | null
  infraestructura?: { id: string; nombre: string; tipo: string | null } | null
}
type SearchProveedor = Pick<
  Proveedor,
  'id' | 'nombre' | 'especialidad' | 'contacto' | 'telefono' | 'contacto_secundario' | 'telefono_secundario'
>
type SearchIncidenciaRaw = Omit<SearchIncidencia, 'activo' | 'equipo' | 'infraestructura'> & {
  activo?: Array<NonNullable<SearchIncidencia['activo']>> | SearchIncidencia['activo']
  equipo?: Array<NonNullable<SearchIncidencia['equipo']>> | SearchIncidencia['equipo']
  infraestructura?: Array<NonNullable<SearchIncidencia['infraestructura']>> | SearchIncidencia['infraestructura']
}
type SearchMantenimientoRaw = Omit<SearchMantenimiento, 'activo' | 'equipo' | 'infraestructura'> & {
  activo?: Array<NonNullable<SearchMantenimiento['activo']>> | SearchMantenimiento['activo']
  equipo?: Array<NonNullable<SearchMantenimiento['equipo']>> | SearchMantenimiento['equipo']
  infraestructura?: Array<NonNullable<SearchMantenimiento['infraestructura']>> | SearchMantenimiento['infraestructura']
}

export default async function BuscarPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams
  const query = normalizeSearchQuery(q)
  const pattern = buildIlikePattern(query)

  let activos: SearchActivo[] = []
  let incidencias: SearchIncidencia[] = []
  let mantenimientos: SearchMantenimiento[] = []
  let proveedores: SearchProveedor[] = []

  if (pattern && query.length >= MIN_QUERY_LENGTH) {
    const supabase = await createServerSupabaseClient()

    const { data: activosData } = await supabase
      .from('activos')
      .select('id,nombre,area,clase,tipo,estado')
      .or(`nombre.ilike.${pattern},area.ilike.${pattern},tipo.ilike.${pattern}`)
      .order('nombre', { ascending: true })
      .limit(RESULT_LIMIT)

    activos = (activosData as SearchActivo[]) ?? []

    const activoIds = activos.map((activo) => activo.id)
    const equipoIds = activos.filter((activo) => activo.clase === 'equipo').map((activo) => activo.id)
    const infraestructuraIds = activos.filter((activo) => activo.clase === 'infraestructura').map((activo) => activo.id)

    const [
      { data: incidenciasTextData },
      { data: incidenciasActivoData },
      { data: mantenimientosTextData },
      { data: mantenimientosActivoData },
      { data: proveedoresData }
    ] = await Promise.all([
      supabase
        .from('incidencias')
        .select('id,ticket_numero,descripcion,prioridad,estado,fecha_reporte,zona_nombre,activo:activos(id,nombre,clase),equipo:equipos(id,nombre),infraestructura:infraestructura(id,nombre,tipo)')
        .or(`ticket_numero.ilike.${pattern},descripcion.ilike.${pattern},zona_nombre.ilike.${pattern},reportado_por.ilike.${pattern}`)
        .order('fecha_reporte', { ascending: false })
        .limit(RESULT_LIMIT),
      activoIds.length || equipoIds.length || infraestructuraIds.length
        ? supabase
            .from('incidencias')
            .select('id,ticket_numero,descripcion,prioridad,estado,fecha_reporte,zona_nombre,activo:activos(id,nombre,clase),equipo:equipos(id,nombre),infraestructura:infraestructura(id,nombre,tipo)')
            .or(buildRelatedRecordFilter(activoIds, equipoIds, infraestructuraIds))
            .order('fecha_reporte', { ascending: false })
            .limit(RESULT_LIMIT)
        : Promise.resolve({ data: [] as SearchIncidencia[] }),
      supabase
        .from('mantenimientos')
        .select('id,descripcion,tipo,fecha_realizacion,realizado_por,zona_nombre,activo:activos(id,nombre,clase),equipo:equipos(id,nombre),infraestructura:infraestructura(id,nombre,tipo)')
        .or(`descripcion.ilike.${pattern},realizado_por.ilike.${pattern},zona_nombre.ilike.${pattern},repuestos_notas.ilike.${pattern}`)
        .order('fecha_realizacion', { ascending: false })
        .limit(RESULT_LIMIT),
      activoIds.length || equipoIds.length || infraestructuraIds.length
        ? supabase
            .from('mantenimientos')
            .select('id,descripcion,tipo,fecha_realizacion,realizado_por,zona_nombre,activo:activos(id,nombre,clase),equipo:equipos(id,nombre),infraestructura:infraestructura(id,nombre,tipo)')
            .or(buildRelatedRecordFilter(activoIds, equipoIds, infraestructuraIds))
            .order('fecha_realizacion', { ascending: false })
            .limit(RESULT_LIMIT)
        : Promise.resolve({ data: [] as SearchMantenimiento[] }),
      supabase
        .from('proveedores')
        .select('id,nombre,especialidad,contacto,telefono,contacto_secundario,telefono_secundario')
        .or(`nombre.ilike.${pattern},especialidad.ilike.${pattern},contacto.ilike.${pattern},contacto_secundario.ilike.${pattern},telefono.ilike.${pattern},telefono_secundario.ilike.${pattern}`)
        .order('nombre', { ascending: true })
        .limit(RESULT_LIMIT)
    ])

    incidencias = mergeUniqueById(
      normalizeIncidencias(incidenciasTextData),
      normalizeIncidencias(incidenciasActivoData)
    ).slice(0, RESULT_LIMIT)
    mantenimientos = mergeUniqueById(
      normalizeMantenimientos(mantenimientosTextData),
      normalizeMantenimientos(mantenimientosActivoData)
    ).slice(0, RESULT_LIMIT)
    proveedores = (proveedoresData as SearchProveedor[]) ?? []
  }

  const total = activos.length + incidencias.length + mantenimientos.length + proveedores.length

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Búsqueda global</h1>
          <p className="brand-hint">Encuentra activos, tickets, mantenimientos y proveedores desde una sola vista.</p>
        </div>
        <div className="brand-card rounded-xl p-4">
          <GlobalSearchForm defaultValue={query} autoFocus />
          <p className="brand-hint mt-2">Busca por nombre, área, ticket, descripción, responsable o teléfono.</p>
        </div>
      </div>

      {!query ? (
        <EmptyState
          title="Escribe algo para empezar"
          detail="Prueba con un activo, un ticket como INC-000123, un proveedor o un área del restaurante."
        />
      ) : query.length < MIN_QUERY_LENGTH ? (
        <EmptyState
          title="La búsqueda es demasiado corta"
          detail={`Usa al menos ${MIN_QUERY_LENGTH} caracteres para evitar ruido en los resultados.`}
        />
      ) : (
        <>
          <div className="brand-card flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm text-[color:var(--brand-muted)]">
            <span>
              {total} resultado{total === 1 ? '' : 's'} para <strong className="text-[color:var(--brand-ink)]">&quot;{query}&quot;</strong>
            </span>
            <span>Hasta {RESULT_LIMIT} por bloque</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SearchSection
              title="Activos"
              count={activos.length}
              empty="Sin coincidencias en activos."
              footerHref="/activos"
              footerLabel="Ver todos los activos"
            >
              {activos.map((activo) => (
                <article key={activo.id} className="rounded-lg border border-[color:var(--brand-border)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={getActivoHref(activo)} className="block truncate font-semibold text-[color:var(--brand-ink)] hover:underline">
                        {activo.nombre}
                      </Link>
                      <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                        {capitalize(activo.clase)} · {activo.tipo}
                        {activo.area ? ` · ${activo.area}` : ''}
                      </p>
                    </div>
                    <span className="brand-subtle-chip inline-flex shrink-0 rounded-md px-2 py-1 text-xs font-medium">
                      {formatActivoEstado(activo.estado)}
                    </span>
                  </div>
                </article>
              ))}
            </SearchSection>

            <SearchSection
              title="Incidencias"
              count={incidencias.length}
              empty="Sin coincidencias en incidencias."
              footerHref="/incidencias"
              footerLabel="Ver todas las incidencias"
            >
              {incidencias.map((incidencia) => (
                <article key={incidencia.id} className="rounded-lg border border-[color:var(--brand-border)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="brand-subtle-chip inline-flex rounded-md px-2 py-1 text-xs font-medium">
                      {incidencia.ticket_numero}
                    </span>
                    <StatusBadge type="incidencia" value={incidencia.estado} />
                    <StatusBadge type="prioridad" value={incidencia.prioridad} />
                  </div>
                  <Link href={`/incidencias/${incidencia.id}`} className="mt-2 block font-semibold text-[color:var(--brand-ink)] hover:underline">
                    {incidencia.descripcion}
                  </Link>
                  <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                    {getIncidenciaDestino(incidencia)} · {formatDateTime(incidencia.fecha_reporte)}
                  </p>
                </article>
              ))}
            </SearchSection>

            <SearchSection
              title="Mantenimientos"
              count={mantenimientos.length}
              empty="Sin coincidencias en mantenimientos."
              footerHref="/mantenimientos"
              footerLabel="Ver todos los mantenimientos"
            >
              {mantenimientos.map((mantenimiento) => (
                <article key={mantenimiento.id} className="rounded-lg border border-[color:var(--brand-border)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge type="mantenimiento" value={mantenimiento.tipo} />
                    <span className="text-sm text-[color:var(--brand-muted)]">{formatDate(mantenimiento.fecha_realizacion)}</span>
                  </div>
                  <Link href={`/mantenimientos/${mantenimiento.id}`} className="mt-2 block font-semibold text-[color:var(--brand-ink)] hover:underline">
                    {mantenimiento.descripcion}
                  </Link>
                  <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                    {getMantenimientoDestino(mantenimiento)}
                    {mantenimiento.realizado_por ? ` · ${mantenimiento.realizado_por}` : ''}
                  </p>
                </article>
              ))}
            </SearchSection>

            <SearchSection
              title="Proveedores"
              count={proveedores.length}
              empty="Sin coincidencias en proveedores."
              footerHref="/proveedores"
              footerLabel="Ver todos los proveedores"
            >
              {proveedores.map((proveedor) => (
                <article key={proveedor.id} className="rounded-lg border border-[color:var(--brand-border)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/proveedores/${proveedor.id}/editar`} className="block truncate font-semibold text-[color:var(--brand-ink)] hover:underline">
                        {proveedor.nombre}
                      </Link>
                      <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                        {proveedor.especialidad ?? 'Sin especialidad'}
                      </p>
                      <p className="mt-2 text-sm text-[color:var(--brand-muted)]">
                        {[proveedor.contacto, proveedor.telefono, proveedor.contacto_secundario, proveedor.telefono_secundario]
                          .filter(Boolean)
                          .join(' · ') || 'Sin datos de contacto'}
                      </p>
                    </div>
                    <Link href={`/cotizaciones?proveedor=${proveedor.id}`} className="brand-button-muted shrink-0 rounded-md px-3 py-2 text-xs font-medium">
                      Cotizaciones
                    </Link>
                  </div>
                </article>
              ))}
            </SearchSection>
          </div>

          {total === 0 ? (
            <EmptyState
              title="No encontré coincidencias"
              detail="Prueba con menos palabras, un ticket exacto o una parte del nombre del activo o proveedor."
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function SearchSection({
  title,
  count,
  empty,
  footerHref,
  footerLabel,
  children
}: {
  title: string
  count: number
  empty: string
  footerHref: string
  footerLabel: string
  children: React.ReactNode
}) {
  return (
    <section className="brand-card rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-[color:var(--brand-ink)]">{title}</h2>
        <span className="brand-subtle-chip inline-flex rounded-md px-2 py-1 text-xs font-medium">{count}</span>
      </div>

      {count ? <div className="space-y-3">{children}</div> : <p className="text-sm text-[color:var(--brand-muted)]">{empty}</p>}

      <div className="mt-4">
        <Link href={footerHref} className="brand-inline-link text-sm">
          {footerLabel}
        </Link>
      </div>
    </section>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="brand-card rounded-xl p-6 text-sm">
      <p className="font-semibold text-[color:var(--brand-ink)]">{title}</p>
      <p className="mt-1 text-[color:var(--brand-muted)]">{detail}</p>
    </div>
  )
}

function normalizeSearchQuery(value?: string) {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
}

function buildIlikePattern(value: string) {
  const safe = value
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ\s/_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!safe) return null
  return `*${safe.replace(/\s+/g, '*')}*`
}

function buildRelatedRecordFilter(activoIds: string[], equipoIds: string[], infraestructuraIds: string[]) {
  return [
    ...activoIds.map((id) => `activo_id.eq.${id}`),
    ...equipoIds.map((id) => `equipo_id.eq.${id}`),
    ...infraestructuraIds.map((id) => `infraestructura_id.eq.${id}`)
  ].join(',')
}

function mergeUniqueById<T extends { id: string }>(...groups: T[][]) {
  const seen = new Set<string>()
  const merged: T[] = []

  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
  }

  return merged
}

function normalizeIncidencias(rows: SearchIncidenciaRaw[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    ...row,
    activo: firstRelation(row.activo),
    equipo: firstRelation(row.equipo),
    infraestructura: firstRelation(row.infraestructura)
  }))
}

function normalizeMantenimientos(rows: SearchMantenimientoRaw[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    ...row,
    activo: firstRelation(row.activo),
    equipo: firstRelation(row.equipo),
    infraestructura: firstRelation(row.infraestructura)
  }))
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function getActivoHref(activo: SearchActivo) {
  if (activo.clase === 'equipo') return `/equipos/${activo.id}`
  if (activo.clase === 'infraestructura') return `/infraestructura/${activo.id}`
  return `/activos/${activo.id}`
}

function getIncidenciaDestino(incidencia: SearchIncidencia) {
  return (
    incidencia.activo?.nombre ??
    incidencia.equipo?.nombre ??
    incidencia.infraestructura?.nombre ??
    incidencia.zona_nombre ??
    'Sin destino'
  )
}

function getMantenimientoDestino(mantenimiento: SearchMantenimiento) {
  return (
    mantenimiento.activo?.nombre ??
    mantenimiento.equipo?.nombre ??
    mantenimiento.infraestructura?.nombre ??
    mantenimiento.zona_nombre ??
    'Sin activo específico'
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatActivoEstado(value: string) {
  return value.replaceAll('_', ' ')
}
