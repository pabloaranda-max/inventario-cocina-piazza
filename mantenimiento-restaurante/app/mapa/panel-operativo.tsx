'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useActionState } from 'react'
import { crearLimpiezaMapa } from './actions'
import { crearActivoRapido } from '../incidencias/actions'
import { initialFormState } from '@/lib/form-state'
import { formatDate, todayMX } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'
import type {
  MapaActivo,
  MapaIncidencia,
  MapaInfraestructura,
  MapaLimpieza,
  MapaPendiente,
  MapaZona,
  ZonaAggregate,
  PanelView
} from '@/lib/types'

// --- Button classes ---

export const mutedButtonClass = 'brand-button-muted'
export const wineButtonClass =
  'rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-wine)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-wine)_22%,transparent)]'
export const oliveButtonClass =
  'rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-olive)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-olive)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)]'
export const goldButtonClass =
  'rounded-md border border-[color:color-mix(in_srgb,var(--brand-gold)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-gold)_14%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-olive)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-gold)_22%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-gold)_22%,transparent)]'

// --- Shared widgets ---

export function PanelViewButton({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
        active
          ? 'border-[color:var(--brand-wine)] bg-[color:color-mix(in_srgb,var(--brand-wine)_14%,white)] text-[color:var(--brand-wine)]'
          : 'border-[rgba(47,62,30,0.14)] bg-[rgba(255,255,255,0.68)] text-[color:var(--brand-muted)] hover:border-[rgba(47,62,30,0.22)] hover:text-[color:var(--brand-ink)] dark:border-white/10 dark:bg-[rgba(18,24,17,0.72)]'
      }`}
    >
      {label}
    </button>
  )
}

export function HudStat({
  label,
  value,
  tone,
  compact = false
}: {
  label: string
  value: number
  tone: 'olive' | 'wine' | 'teal' | 'gold'
  compact?: boolean
}) {
  const toneClass = {
    olive: 'bg-[rgba(232,239,210,0.12)] text-[rgba(232,239,210,0.98)]',
    wine: 'bg-[rgba(155,30,33,0.18)] text-[rgba(255,232,225,0.98)]',
    teal: 'bg-[rgba(15,118,110,0.18)] text-[rgba(198,255,245,0.98)]',
    gold: 'bg-[rgba(239,169,30,0.16)] text-[rgba(255,223,130,0.98)]'
  }[tone]

  return (
    <div className={`rounded-xl px-3 ${compact ? 'py-1.5' : 'py-2'} ${toneClass}`}>
      <p className={`${compact ? 'text-base' : 'text-lg'} font-semibold leading-none`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
    </div>
  )
}

function MiniMetric({
  label,
  value,
  tone
}: {
  label: string
  value: number
  tone: 'orange' | 'red' | 'yellow' | 'teal'
}) {
  const toneClass = {
    orange: 'bg-[rgba(239,169,30,0.12)] text-[#8f5a00] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]',
    red: 'bg-[rgba(155,30,33,0.1)] text-[color:var(--brand-wine)] dark:bg-[rgba(155,30,33,0.28)] dark:text-[rgba(255,200,196,0.98)]',
    yellow: 'bg-[rgba(239,169,30,0.08)] text-[#7a5500] dark:bg-[rgba(90,65,24,0.56)] dark:text-[rgba(255,223,130,0.86)]',
    teal: 'bg-[rgba(15,118,110,0.1)] text-[#0f4a44] dark:bg-[rgba(15,118,110,0.28)] dark:text-[rgba(198,255,245,0.96)]'
  }[tone]

  return (
    <div className={`rounded-[16px] px-3 py-3 ${toneClass}`}>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</p>
    </div>
  )
}

export function IncidenciaLink({ incidencia }: { incidencia: MapaIncidencia }) {
  return (
    <Link
      href={`/incidencias/${incidencia.id}`}
      className="block rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] p-2 text-sm text-[color:var(--brand-wine)] hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)]"
    >
      <span className="font-medium">{incidencia.ticket_numero} · {incidencia.descripcion}</span>
      <span className="mt-1 block text-xs text-[color:var(--brand-wine)]">
        {incidencia.zona_nombre ?? 'Sin ubicación'} · {incidencia.prioridad} · {formatDate(incidencia.fecha_reporte)}
      </span>
    </Link>
  )
}

function LimpiezaLink({ limpieza }: { limpieza: MapaLimpieza }) {
  return (
    <Link
      href={`/mantenimientos/${limpieza.id}`}
      className="block rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] p-2 text-sm text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-olive)_18%,white)]"
    >
      <span className="font-medium">{formatDate(limpieza.fecha_realizacion)} · {limpieza.descripcion}</span>
      <span className="mt-1 block text-xs text-[color:var(--brand-olive)]">
        {limpieza.activo?.nombre ?? limpieza.zona_nombre ?? 'Sin ubicación'}
        {limpieza.realizado_por ? ` · ${limpieza.realizado_por}` : ''}
      </span>
    </Link>
  )
}

function ActivoPanel({
  activo,
  incidencias,
  limpiezas
}: {
  activo: MapaActivo
  incidencias: MapaIncidencia[]
  limpiezas: MapaLimpieza[]
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-[color:var(--brand-ink)]">{activo.nombre}</h2>
        <p className="text-sm text-[color:var(--brand-muted)]">
          {activo.area ?? 'Sin área'} · {activo.tipo}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge type={activo.clase === 'equipo' ? 'equipo' : 'infraestructura'} value={activo.estado} />
        <StatusBadge type="criticidad" value={activo.criticidad} />
        {incidencias.length ? (
          <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-wine)]">
            {incidencias.length} incidencia{incidencias.length === 1 ? '' : 's'}
          </span>
        ) : null}
        {limpiezas.length ? (
          <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-olive)]">
            {limpiezas.length} limpieza{limpiezas.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      <div className="space-y-1 text-sm text-[color:var(--brand-muted)]">
        <p>Próxima revisión: {formatDate(activo.fecha_proxima_revision)}</p>
        {activo.limpieza_intervalo_dias ? (
          <p>Limpieza profunda: {formatDate(activo.fecha_proxima_limpieza)}</p>
        ) : null}
      </div>
      {incidencias.length ? (
        <div className="space-y-2">
          {incidencias.slice(0, 3).map((incidencia) => (
            <Link
              key={incidencia.id}
              href={`/incidencias/${incidencia.id}`}
              className="block rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] p-2 text-sm font-medium text-[color:var(--brand-wine)] hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)]"
            >
              {incidencia.ticket_numero} · {incidencia.descripcion}
            </Link>
          ))}
        </div>
      ) : null}
      {limpiezas.length ? (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Limpiezas</h3>
          {limpiezas.slice(0, 3).map((limpieza) => (
            <LimpiezaLink key={limpieza.id} limpieza={limpieza} />
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link href={`/activos/${activo.id}`} className={mutedButtonClass}>
          Ver ficha
        </Link>
        <Link href={`/incidencias/nueva?activo=${activo.id}`} className={wineButtonClass}>
          Reportar
        </Link>
        <Link href={`/mantenimientos/nuevo?activo=${activo.id}&tipo=preventivo`} className={oliveButtonClass}>
          Programado
        </Link>
        <Link href={`/mantenimientos/nuevo?activo=${activo.id}&tipo=limpieza_profunda`} className={oliveButtonClass}>
          Limpieza
        </Link>
        <Link href={`/cotizaciones/nueva?activo=${activo.id}`} className={goldButtonClass}>
          Cotizar
        </Link>
      </div>
    </div>
  )
}

function InfraestructuraPanel({ item }: { item: MapaInfraestructura }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-[color:var(--brand-ink)]">{item.nombre}</h2>
        <p className="text-sm text-[color:var(--brand-muted)]">
          {item.area ?? 'Sin área'} · {item.tipo}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge type="infraestructura" value={item.estado} />
        <StatusBadge type="criticidad" value={item.criticidad} />
      </div>
      <p className="text-sm text-[color:var(--brand-muted)]">
        Próxima revisión: {formatDate(item.fecha_proxima_revision)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/infraestructura/${item.id}`} className={mutedButtonClass}>
          Ver ficha
        </Link>
        <Link href={`/incidencias/nueva?infraestructura=${item.id}`} className={wineButtonClass}>
          Reportar
        </Link>
        <Link href={`/mantenimientos/nuevo?infraestructura=${item.id}`} className={oliveButtonClass}>
          Mantto.
        </Link>
      </div>
    </div>
  )
}

// --- Modal sub-components ---

function NuevoActivoModal({
  zona,
  state,
  formAction,
  onClose
}: {
  zona: MapaZona
  state: typeof initialFormState
  formAction: (formData: FormData) => void
  onClose: () => void
}) {
  const zonaLabel = zona.nombre || zona.label || null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[color:var(--brand-border)] bg-[color:var(--brand-paper)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-[color:var(--brand-ink)]">Nuevo activo en {zonaLabel}</h3>
          <button type="button" onClick={onClose} className="text-[color:var(--brand-muted)] hover:text-[color:var(--brand-ink)]">✕</button>
        </div>
        {state.error ? (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        ) : null}
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="zona_id" value={zona.id} />
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--brand-muted)]">Nombre *</span>
            <input name="nombre" required placeholder="ej. Freidora principal" className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] placeholder-[color:var(--brand-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--brand-muted)]">Clase *</span>
              <select name="clase" required className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white">
                <option value="">Seleccionar</option>
                {(['equipo', 'infraestructura', 'mobiliario', 'edificacion', 'sistema'] as const).map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--brand-muted)]">Tipo *</span>
              <input name="tipo" required placeholder="ej. Freidora" className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] placeholder-[color:var(--brand-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white" />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={mutedButtonClass}>Cancelar</button>
            <button type="submit" className={oliveButtonClass}>Crear activo</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NuevaLimpiezaModal({
  zona,
  state,
  formAction,
  onClose
}: {
  zona: MapaZona | null
  state: typeof initialFormState
  formAction: (formData: FormData) => void
  onClose: () => void
}) {
  const zonaLabel = zona ? (zona.nombre || zona.label || null) : null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[color:var(--brand-border)] bg-[color:var(--brand-paper)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-[color:var(--brand-ink)]">Nueva limpieza{zonaLabel ? ` en ${zonaLabel}` : ''}</h3>
          <button type="button" onClick={onClose} className="text-[color:var(--brand-muted)] hover:text-[color:var(--brand-ink)]">✕</button>
        </div>
        {state.error ? (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        ) : null}
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="zona_id" value={zona?.id ?? ''} />
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--brand-muted)]">Descripción *</span>
            <input name="descripcion" required placeholder="ej. Limpieza profunda de barra fría" className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] placeholder-[color:var(--brand-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--brand-muted)]">Fecha</span>
              <input type="date" name="fecha_realizacion" defaultValue={todayMX()} className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--brand-muted)]">Realizado por</span>
              <input name="realizado_por" placeholder="Nombre" className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] placeholder-[color:var(--brand-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white" />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={mutedButtonClass}>Cancelar</button>
            <button type="submit" className={oliveButtonClass}>Registrar limpieza</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- Main panel ---

type ResumenNivel = {
  zonas: number
  activos: number
  infraestructura: number
  incidencias: number
  incidenciasUrgentes: number
  urgentes: MapaIncidencia[]
  pendientes: MapaPendiente[]
  atorados: MapaIncidencia[]
  revisionesVencidas: number
  preventivosProximos: number
  limpiezasAtrasadas: number
}

export function UnifiedOperationPanel({
  view,
  resumenNivel,
  activos,
  infraestructura,
  incidencias,
  limpiezas,
  incidenciasSinUbicacion,
  limpiezasSinUbicacion,
  selectedZona,
  selectedZonaAggregate,
  selectedActivo,
  selectedInfraestructura,
  incidenciasPorActivo,
  limpiezasPorActivo
}: {
  view: Exclude<PanelView, 'editing'>
  resumenNivel: ResumenNivel
  activos: MapaActivo[]
  infraestructura: MapaInfraestructura[]
  incidencias: MapaIncidencia[]
  limpiezas: MapaLimpieza[]
  incidenciasSinUbicacion: MapaIncidencia[]
  limpiezasSinUbicacion: MapaLimpieza[]
  selectedZona: MapaZona | null
  selectedZonaAggregate: ZonaAggregate | null
  selectedActivo: MapaActivo | null
  selectedInfraestructura: MapaInfraestructura | null
  incidenciasPorActivo: Record<string, MapaIncidencia[]>
  limpiezasPorActivo: Record<string, MapaLimpieza[]>
}) {
  const router = useRouter()
  const [showNuevoActivo, setShowNuevoActivo] = useState(false)
  const [showNuevaLimpieza, setShowNuevaLimpieza] = useState(false)
  const [nuevoActivoState, nuevoActivoAction] = useActionState(
    async (state: typeof initialFormState, formData: FormData) => {
      const result = await crearActivoRapido(state, formData)
      if (result.activo) {
        setShowNuevoActivo(false)
        router.refresh()
      }
      return result
    },
    initialFormState
  )
  const [nuevaLimpiezaState, nuevaLimpiezaAction] = useActionState(
    async (state: typeof initialFormState, formData: FormData) => {
      const result = await crearLimpiezaMapa(state, formData)
      if (result.success) {
        setShowNuevaLimpieza(false)
        router.refresh()
      }
      return result
    },
    initialFormState
  )

  const zonaLabel = selectedZona?.nombre || selectedZona?.label || null
  const selectedActivoIncidencias = selectedActivo ? incidenciasPorActivo[selectedActivo.id] ?? [] : []
  const selectedActivoLimpiezas = selectedActivo ? limpiezasPorActivo[selectedActivo.id] ?? [] : []

  return (
    <div className="space-y-4">
      {selectedZona ? (
        <section className="rounded-[22px] border border-[rgba(47,62,30,0.14)] bg-[rgba(255,255,255,0.78)] p-4 dark:bg-[rgba(19,25,17,0.94)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--brand-muted)]">
            Contexto activo
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--brand-ink)]">{zonaLabel}</h3>
              <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                {selectedZona.tipo === 'subzona' ? 'Subzona' : 'Zona'} seleccionada dentro del mapa.
              </p>
            </div>
            {selectedZonaAggregate ? (
              <div className="grid grid-cols-2 gap-2">
                <HudStat label="Activos" value={selectedZonaAggregate.activos} tone="olive" compact />
                <HudStat label="Incid." value={selectedZonaAggregate.incidencias} tone="wine" compact />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-[22px] border border-[rgba(47,62,30,0.14)] bg-[rgba(255,255,255,0.78)] p-4 dark:bg-[rgba(19,25,17,0.94)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--brand-muted)]">
          Acciones rápidas
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={selectedZona ? `/incidencias/nueva?zona=${selectedZona.id}` : '/incidencias/nueva'} className={wineButtonClass}>
            Nueva incidencia
          </Link>
          <button type="button" onClick={() => setShowNuevaLimpieza(true)} className={oliveButtonClass}>
            Nueva limpieza
          </button>
          {selectedZona ? (
            <button type="button" onClick={() => setShowNuevoActivo(true)} className={oliveButtonClass}>
              Nuevo activo aquí
            </button>
          ) : null}
          <Link href="/incidencias" className={mutedButtonClass}>
            Historial incidencias
          </Link>
          <Link href="/mantenimientos" className={mutedButtonClass}>
            Historial manttos
          </Link>
        </div>
      </section>

      {showNuevoActivo && selectedZona ? (
        <NuevoActivoModal
          zona={selectedZona}
          state={nuevoActivoState}
          formAction={nuevoActivoAction}
          onClose={() => setShowNuevoActivo(false)}
        />
      ) : null}

      {showNuevaLimpieza ? (
        <NuevaLimpiezaModal
          zona={selectedZona}
          state={nuevaLimpiezaState}
          formAction={nuevaLimpiezaAction}
          onClose={() => setShowNuevaLimpieza(false)}
        />
      ) : null}

      {view === 'summary' ? (
        <>
          <section className="grid grid-cols-2 gap-2">
            <MiniMetric label="Sin asignar" value={resumenNivel.pendientes.length} tone="orange" />
            <MiniMetric label="Urgentes" value={resumenNivel.incidenciasUrgentes} tone="red" />
            <MiniMetric label="En progreso" value={resumenNivel.atorados.length} tone="yellow" />
            <MiniMetric label="Preventivos" value={resumenNivel.preventivosProximos} tone="teal" />
          </section>

          {selectedZonaAggregate ? (
            <section className="rounded-[22px] border border-[rgba(47,62,30,0.14)] bg-[rgba(255,255,255,0.78)] p-4 dark:bg-[rgba(19,25,17,0.94)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Resumen de zona</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MiniMetric label="Activos" value={selectedZonaAggregate.activos} tone="orange" />
                <MiniMetric label="Incidencias" value={selectedZonaAggregate.incidencias} tone="red" />
                <MiniMetric label="Limpiezas" value={selectedZonaAggregate.limpiezas} tone="teal" />
                <MiniMetric label="Preventivos" value={selectedZonaAggregate.preventivos} tone="yellow" />
              </div>
            </section>
          ) : null}

          {resumenNivel.pendientes.length > 0 ? (
            <section className="space-y-2 rounded-[22px] border border-[rgba(239,169,30,0.2)] bg-[linear-gradient(180deg,rgba(255,249,233,1),rgba(250,239,205,0.96))] p-4 dark:bg-[rgba(90,65,24,0.52)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Sin asignar</p>
              {resumenNivel.pendientes.slice(0, 4).map((pendiente) => (
                <Link key={pendiente.id} href={`/incidencias/${pendiente.id}`} className="block rounded-[18px] border border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] p-3 text-sm text-[#8f5a00] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]">
                  <span className="font-medium">{pendiente.ticket_numero} · {pendiente.descripcion}</span>
                  <span className="mt-1 block text-xs">{formatDate(pendiente.fecha_reporte)}</span>
                </Link>
              ))}
            </section>
          ) : null}

          {resumenNivel.urgentes.length > 0 ? (
            <section className="space-y-2 rounded-[22px] border border-[rgba(155,30,33,0.15)] bg-[linear-gradient(180deg,rgba(255,243,242,1),rgba(255,228,225,0.94))] p-4 dark:bg-[rgba(98,24,24,0.54)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Urgentes</p>
              {resumenNivel.urgentes.slice(0, 4).map((incidencia) => (
                <IncidenciaLink key={incidencia.id} incidencia={incidencia} />
              ))}
            </section>
          ) : null}

          {resumenNivel.atorados.length > 0 ? (
            <section className="space-y-2 rounded-[22px] border border-[rgba(155,30,33,0.15)] bg-[linear-gradient(180deg,rgba(255,245,244,1),rgba(255,233,230,0.92))] p-4 dark:bg-[rgba(80,20,20,0.52)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Atorados</p>
              {resumenNivel.atorados.slice(0, 4).map((incidencia) => (
                <IncidenciaLink key={incidencia.id} incidencia={incidencia} />
              ))}
            </section>
          ) : null}

          {!resumenNivel.pendientes.length && !resumenNivel.urgentes.length && !resumenNivel.atorados.length ? (
            <p className="text-sm text-[color:var(--brand-muted)]">No hay alertas inmediatas.</p>
          ) : null}
        </>
      ) : null}

      {view === 'assets' ? (
        <>
          {selectedActivo ? (
            <ActivoPanel activo={selectedActivo} incidencias={selectedActivoIncidencias} limpiezas={selectedActivoLimpiezas} />
          ) : selectedInfraestructura ? (
            <InfraestructuraPanel item={selectedInfraestructura} />
          ) : (
            <>
              {activos.length ? (
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Activos</p>
                  {activos.slice(0, 12).map((activo) => {
                    const activoIncidencias = incidenciasPorActivo[activo.id] ?? []
                    const activoLimpiezas = limpiezasPorActivo[activo.id] ?? []
                    return (
                      <article key={activo.id} className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_72%,white)] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge type={activo.clase === 'equipo' ? 'equipo' : 'infraestructura'} value={activo.estado} />
                          {activoIncidencias.length ? (
                            <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-wine)]">
                              {activoIncidencias.length} inc.
                            </span>
                          ) : null}
                          {activoLimpiezas.length ? (
                            <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-olive)]">
                              {activoLimpiezas.length} limp.
                            </span>
                          ) : null}
                        </div>
                        <Link href={`/activos/${activo.id}`} className="mt-2 block font-medium text-[color:var(--brand-ink)] hover:underline">
                          {activo.nombre}
                        </Link>
                        <p className="mt-1 text-sm text-[color:var(--brand-muted)]">{activo.area ?? 'Sin área'} · {activo.tipo}</p>
                      </article>
                    )
                  })}
                </section>
              ) : (
                <p className="text-sm text-[color:var(--brand-muted)]">No hay activos visibles en este contexto.</p>
              )}
              {infraestructura.length ? (
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Infraestructura</p>
                  {infraestructura.slice(0, 8).map((item) => (
                    <Link key={item.id} href={`/infraestructura/${item.id}`} className="block rounded-[18px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_72%,white)] p-3 transition hover:border-[color:var(--brand-wine)]">
                      <span className="font-medium text-[color:var(--brand-ink)]">{item.nombre}</span>
                      <span className="mt-1 block text-sm text-[color:var(--brand-muted)]">{item.area ?? 'Sin área'} · {item.tipo}</span>
                    </Link>
                  ))}
                </section>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {view === 'incidents' ? (
        <>
          {incidencias.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Incidencias abiertas</p>
              {incidencias.slice(0, 10).map((incidencia) => (
                <IncidenciaLink key={incidencia.id} incidencia={incidencia} />
              ))}
            </section>
          ) : (
            <p className="text-sm text-[color:var(--brand-muted)]">No hay incidencias activas en este contexto.</p>
          )}
          {incidenciasSinUbicacion.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Sin ubicación</p>
              {incidenciasSinUbicacion.slice(0, 6).map((incidencia) => (
                <IncidenciaLink key={incidencia.id} incidencia={incidencia} />
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      {view === 'cleaning' ? (
        <>
          {limpiezas.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Limpiezas y profundas</p>
              {limpiezas.slice(0, 10).map((limpieza) => (
                <LimpiezaLink key={limpieza.id} limpieza={limpieza} />
              ))}
            </section>
          ) : (
            <p className="text-sm text-[color:var(--brand-muted)]">No hay limpiezas registradas en este contexto.</p>
          )}
          {limpiezasSinUbicacion.length ? (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Sin ubicación</p>
              {limpiezasSinUbicacion.slice(0, 6).map((limpieza) => (
                <LimpiezaLink key={limpieza.id} limpieza={limpieza} />
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
