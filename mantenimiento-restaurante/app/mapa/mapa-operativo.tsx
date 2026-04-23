'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useFormState } from 'react-dom'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { guardarMapaZonas } from './actions'
import { crearActivoRapido } from '../incidencias/actions'
import { equipoAreas } from '@/lib/defined-options'
import type {
  ClaseActivo,
  CriticidadInfraestructura,
  EstadoActivo,
  EstadoIncidencia,
  EstadoInfraestructura,
  MapaNivel,
  MapaZona,
  PrioridadIncidencia
} from '@/lib/types'
import { initialFormState } from '@/lib/form-state'
import { FormError } from '@/components/ui/flash-message'
import { formatDate } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

export type MapaIncidencia = {
  id: string
  ticket_numero: string
  descripcion: string
  prioridad: PrioridadIncidencia
  estado: EstadoIncidencia
  activo_id: string | null
  equipo_id: string | null
  infraestructura_id: string | null
  zona_id: string | null
  zona_nombre: string | null
}

export type MapaActivo = {
  id: string
  nombre: string
  tipo: string
  area: string | null
  clase: ClaseActivo
  estado: EstadoActivo
  criticidad: CriticidadInfraestructura
  nivel_id: string | null
  x: number | null
  y: number | null
  zona_id: string | null
  fecha_proxima_revision: string | null
  fecha_proxima_limpieza: string | null
  limpieza_intervalo_dias: number | null
}

export type MapaInfraestructura = {
  id: string
  nombre: string
  tipo: string
  area: string | null
  estado: EstadoInfraestructura
  criticidad: CriticidadInfraestructura
  nivel_id: string | null
  x: number | null
  y: number | null
  fecha_proxima_revision: string | null
}

export type MapaLimpieza = {
  id: string
  descripcion: string
  fecha_realizacion: string
  realizado_por: string | null
  activo_id: string | null
  zona_id: string | null
  zona_nombre: string | null
  activo?: Pick<MapaActivo, 'id' | 'nombre' | 'area'> | null
}

export type MapaPendiente = {
  id: string
  ticket_numero: string
  descripcion: string
  prioridad: PrioridadIncidencia
  estado: 'pendiente_asignacion'
  fecha_reporte: string
  zona_nombre: string | null
}

type ZonaGeometry = {
  x: number
  y: number
  width: number
  height: number
}

type ZonaPoint = {
  x: number
  y: number
}

type RectHandleCorner = 'nw' | 'ne' | 'se' | 'sw'

type ZonaRenderData = {
  zona: MapaZona
  total: number
  totalIncidenciasZona: number
  totalLimpiezasZona: number
  totalUrgentesZona: number
  totalPreventivosZona: number
  tone: ZonaStatusTone
  hasIncidencia: boolean
  hasLimpieza: boolean
  isSelected: boolean
  isEditingThis: boolean
  geometry: ZonaGeometry
  polygonPoints: ZonaPoint[]
}

type NuevaZonaDraft = {
  area: string
  nombre: string
  tipo: MapaZona['tipo']
  geometryTipo: MapaZona['geometry_tipo']
}

type ZonaStatusTone = 'critical' | 'warning' | 'ok'

type ZonaAggregate = {
  activos: number
  incidencias: number
  urgentes: number
  limpiezas: number
  preventivos: number
  tone: ZonaStatusTone
}

type ZonaAggregateSets = {
  activos: Set<string>
  incidencias: Set<string>
  urgentes: Set<string>
  limpiezas: Set<string>
  preventivos: Set<string>
}

type ZonaAggregateRow = {
  zona_id: string
  activos: number
  incidencias: number
  urgentes: number
  limpiezas: number
  preventivos: number
}

const mutedButtonClass = 'brand-button-muted'
const wineButtonClass =
  'rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-wine)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-wine)_22%,transparent)]'
const oliveButtonClass =
  'rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-olive)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-olive)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)]'
const goldButtonClass =
  'rounded-md border border-[color:color-mix(in_srgb,var(--brand-gold)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-gold)_14%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-olive)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-gold)_22%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-gold)_22%,transparent)]'
const defaultNuevaZonaDraft: NuevaZonaDraft = {
  area: '',
  nombre: '',
  tipo: 'zona',
  geometryTipo: 'rect'
}

function getDueSoon(date: string | null, today: string, windowEnd: string) {
  if (!date) return false
  return date >= today && date <= windowEnd
}

function getAggregateTone(row: Omit<ZonaAggregate, 'tone'>): ZonaStatusTone {
  if (row.urgentes > 0 || row.incidencias > 0) return 'critical'
  if (row.preventivos > 0 || row.limpiezas > 0) return 'warning'
  return 'ok'
}

function buildZonaAggregateMap(zonas: MapaZona[], rows: ZonaAggregateRow[]) {
  const byZonaId = Object.fromEntries(
    zonas.map((zona) => [
      zona.id,
      {
        activos: 0,
        incidencias: 0,
        urgentes: 0,
        limpiezas: 0,
        preventivos: 0,
        tone: 'ok' as ZonaStatusTone
      }
    ])
  ) as Record<string, ZonaAggregate>

  rows.forEach((row) => {
    if (!byZonaId[row.zona_id]) return

    const aggregate = {
      activos: row.activos,
      incidencias: row.incidencias,
      urgentes: row.urgentes,
      limpiezas: row.limpiezas,
      preventivos: row.preventivos
    }

    byZonaId[row.zona_id] = {
      ...aggregate,
      tone: getAggregateTone(aggregate)
    }
  })

  return byZonaId
}

function getZonaGeometry(zona: MapaZona): ZonaGeometry {
  const geometry = zona.geometry ?? {}
  const polygonPoints = getZonaPolygonPoints(zona)

  if (zona.geometry_tipo === 'polygon' && polygonPoints.length >= 3) {
    const metrics = getPolygonMetrics(polygonPoints)
    return metrics
  }

  const x = typeof geometry.x === 'number' ? geometry.x : zona.x
  const y = typeof geometry.y === 'number' ? geometry.y : zona.y
  const width = typeof geometry.width === 'number' ? geometry.width : 18
  const height = typeof geometry.height === 'number' ? geometry.height : 12

  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    width: Math.min(100, Math.max(2, width)),
    height: Math.min(100, Math.max(2, height))
  }
}

function getZonaPolygonPoints(zona: MapaZona): ZonaPoint[] {
  const geometry = zona.geometry ?? {}
  const maybePoints = Array.isArray((geometry as { points?: unknown[] }).points)
    ? (geometry as { points: unknown[] }).points
    : null

  if (maybePoints) {
    const points = maybePoints
      .map((point) => {
        if (!point || typeof point !== 'object') return null
        const candidate = point as { x?: unknown; y?: unknown }
        if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') return null
        return {
          x: Math.min(100, Math.max(0, candidate.x)),
          y: Math.min(100, Math.max(0, candidate.y))
        }
      })
      .filter((point): point is ZonaPoint => point !== null)

    if (points.length >= 3) return points
  }

  const base = getZonaFallbackRect(zona)
  return rectToPolygon(base)
}

function getZonaFallbackRect(zona: MapaZona): ZonaGeometry {
  const geometry = zona.geometry ?? {}
  const x = typeof geometry.x === 'number' ? geometry.x : zona.x
  const y = typeof geometry.y === 'number' ? geometry.y : zona.y
  const width = typeof geometry.width === 'number' ? geometry.width : 18
  const height = typeof geometry.height === 'number' ? geometry.height : 12

  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    width: Math.min(100, Math.max(2, width)),
    height: Math.min(100, Math.max(2, height))
  }
}

function rectToPolygon(geometry: ZonaGeometry): ZonaPoint[] {
  return [
    { x: geometry.x - geometry.width / 2, y: geometry.y - geometry.height / 2 },
    { x: geometry.x + geometry.width / 2, y: geometry.y - geometry.height / 2 },
    { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 },
    { x: geometry.x - geometry.width / 2, y: geometry.y + geometry.height / 2 }
  ].map((point) => ({
    x: Math.min(100, Math.max(0, Number(point.x.toFixed(3)))),
    y: Math.min(100, Math.max(0, Number(point.y.toFixed(3))))
  }))
}

function getPolygonMetrics(points: ZonaPoint[]): ZonaGeometry {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const x = Number(((minX + maxX) / 2).toFixed(3))
  const y = Number(((minY + maxY) / 2).toFixed(3))

  return {
    x,
    y,
    width: Number(Math.max(2, maxX - minX).toFixed(3)),
    height: Number(Math.max(2, maxY - minY).toFixed(3))
  }
}

function serializePolygonPoints(points: ZonaPoint[]) {
  return points.map((point) => `${point.x.toFixed(2)}, ${point.y.toFixed(2)}`).join('\n')
}

function parsePolygonPoints(text: string): ZonaPoint[] | null {
  const points = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawX, rawY] = line.split(',').map((part) => part.trim())
      const x = Number(rawX)
      const y = Number(rawY)

      if (Number.isNaN(x) || Number.isNaN(y)) return null

      return {
        x: Math.min(100, Math.max(0, Number(x.toFixed(3)))),
        y: Math.min(100, Math.max(0, Number(y.toFixed(3))))
      }
    })
    .filter((point): point is ZonaPoint => point !== null)

  return points.length >= 3 ? points : null
}

function addPolygonMidpoint(points: ZonaPoint[]): ZonaPoint[] {
  if (points.length < 2) return points

  let insertAfterIndex = 0
  let maxDistance = -1

  points.forEach((point, index) => {
    const nextPoint = points[(index + 1) % points.length]
    const distance = Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y)

    if (distance > maxDistance) {
      maxDistance = distance
      insertAfterIndex = index
    }
  })

  const currentPoint = points[insertAfterIndex]
  const nextPoint = points[(insertAfterIndex + 1) % points.length]

  return [
    ...points.slice(0, insertAfterIndex + 1),
    {
      x: Number((((currentPoint.x + nextPoint.x) / 2)).toFixed(3)),
      y: Number((((currentPoint.y + nextPoint.y) / 2)).toFixed(3))
    },
    ...points.slice(insertAfterIndex + 1)
  ]
}

export function MapaOperativo({
  activos,
  incidencias,
  niveles,
  zonas,
  areas: areasProp,
  infraestructura,
  limpiezas,
  pendientes
}: {
  activos: MapaActivo[]
  incidencias: MapaIncidencia[]
  niveles: MapaNivel[]
  zonas: MapaZona[]
  areas: string[]
  infraestructura: MapaInfraestructura[]
  limpiezas: MapaLimpieza[]
  pendientes: MapaPendiente[]
}) {
  const router = useRouter()
  const [selectedNivelId, setSelectedNivelId] = useState(niveles[1]?.id ?? niveles[0]?.id ?? '')
  const [selectedZonaId, setSelectedZonaId] = useState<string | null>(null)
  const [selectedActivoId, setSelectedActivoId] = useState<string | null>(null)
  const [selectedInfraestructuraId, setSelectedInfraestructuraId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [editing, setEditing] = useState(false)
  const [viewMode, setViewMode] = useState<'operativo' | 'arquitectonico'>('operativo')
  const [showZonas, setShowZonas] = useState(true)
  const [showActivos, setShowActivos] = useState(true)
  const [showInfraestructura, setShowInfraestructura] = useState(true)
  const [editableZonas, setEditableZonas] = useState(zonas)
  const [deletedZonaIds, setDeletedZonaIds] = useState<string[]>([])
  const [editingZonaId, setEditingZonaId] = useState<string | null>(null)
  const [newZonaDraft, setNewZonaDraft] = useState<NuevaZonaDraft>(defaultNuevaZonaDraft)
  const [state, formAction] = useFormState(guardarMapaZonas, initialFormState)

  useEffect(() => {
    if (state.success) {
      setEditing(false)
      setDeletedZonaIds([])
      router.refresh()
    }
  }, [state.success, router])

  useEffect(() => {
    if (!editing) setEditableZonas(zonas)
  }, [editing, zonas])

  const mapRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const suppressNextClick = useRef(false)
  const dragZonaIdRef = useRef<string | null>(null)
  const dragPolygonVertexRef = useRef<{ zonaId: string; pointIndex: number } | null>(null)
  const dragRectHandleRef = useRef<{ zonaId: string; corner: RectHandleCorner } | null>(null)
  const [activePolygonVertex, setActivePolygonVertex] = useState<{ zonaId: string; pointIndex: number } | null>(null)
  const [activeRectHandle, setActiveRectHandle] = useState<{ zonaId: string; corner: RectHandleCorner } | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const selectedNivel = niveles.find((nivel) => nivel.id === selectedNivelId) ?? niveles[0]
  const zonasById = useMemo(
    () => editableZonas.reduce<Record<string, MapaZona>>((acc, zona) => ({ ...acc, [zona.id]: zona }), {}),
    [editableZonas]
  )
  const zonasNivel = editableZonas.filter((zona) => zona.nivel_id === selectedNivel?.id)
  const zonaAncestorsById = useMemo(() => {
    return zonasNivel.reduce<Record<string, string[]>>((acc, zona) => {
      const ancestors: string[] = []
      let currentParentId = zona.parent_id

      while (currentParentId) {
        const parent = zonasById[currentParentId]
        if (!parent) break
        ancestors.push(parent.id)
        currentParentId = parent.parent_id
      }

      acc[zona.id] = ancestors
      return acc
    }, {})
  }, [zonasById, zonasNivel])
  const zonasIdsByArea = useMemo(() => {
    return zonasNivel.reduce<Record<string, string[]>>((acc, zona) => {
      const area = zona.area || 'Sin área'
      acc[area] = acc[area] ?? []
      acc[area].push(zona.id)
      return acc
    }, {})
  }, [zonasNivel])
  const activosPorId = useMemo(
    () => activos.reduce<Record<string, MapaActivo>>((acc, activo) => ({ ...acc, [activo.id]: activo }), {}),
    [activos]
  )
  const infraestructuraPorId = useMemo(
    () => infraestructura.reduce<Record<string, MapaInfraestructura>>((acc, item) => ({ ...acc, [item.id]: item }), {}),
    [infraestructura]
  )

  const areas = useMemo(() => {
    const extra = editableZonas.map((z) => z.area).filter((a) => a && !areasProp.includes(a))
    return Array.from(new Set([...areasProp, ...extra])).sort((a, b) => a.localeCompare(b, 'es'))
  }, [areasProp, editableZonas])

  const activosNivelBase = useMemo(
    () => activos.filter((activo) => activo.nivel_id === selectedNivel?.id),
    [activos, selectedNivel?.id]
  )
  const activosNivel = useMemo(
    () => activosNivelBase.filter((activo) => activo.x !== null && activo.y !== null),
    [activosNivelBase]
  )
  const infraestructuraNivelBase = useMemo(
    () => infraestructura.filter((item) => item.nivel_id === selectedNivel?.id),
    [infraestructura, selectedNivel?.id]
  )
  const infraestructuraNivel = useMemo(
    () => infraestructuraNivelBase.filter((item) => item.x !== null && item.y !== null),
    [infraestructuraNivelBase]
  )
  const incidenciasNivel = useMemo(() => {
    return incidencias.filter((incidencia) => {
      if (incidencia.zona_id) return zonasById[incidencia.zona_id]?.nivel_id === selectedNivel?.id
      if (incidencia.activo_id) return activosPorId[incidencia.activo_id]?.nivel_id === selectedNivel?.id
      if (incidencia.infraestructura_id) {
        return infraestructuraPorId[incidencia.infraestructura_id]?.nivel_id === selectedNivel?.id
      }
      return false
    })
  }, [activosPorId, incidencias, infraestructuraPorId, selectedNivel?.id, zonasById])
  const incidenciasSinUbicacion = useMemo(() => {
    return incidencias.filter(
      (incidencia) => !incidencia.activo_id && !incidencia.equipo_id && !incidencia.infraestructura_id && !incidencia.zona_id
    )
  }, [incidencias])
  const limpiezasNivel = useMemo(() => {
    return limpiezas.filter((limpieza) => {
      if (limpieza.zona_id) return zonasById[limpieza.zona_id]?.nivel_id === selectedNivel?.id
      if (limpieza.activo_id) return activosPorId[limpieza.activo_id]?.nivel_id === selectedNivel?.id
      return false
    })
  }, [activosPorId, limpiezas, selectedNivel?.id, zonasById])
  const limpiezasSinUbicacion = useMemo(() => {
    return limpiezas.filter((limpieza) => !limpieza.activo_id && !limpieza.zona_id)
  }, [limpiezas])
  const incidenciasPorActivo = useMemo(() => {
    return incidenciasNivel.reduce<Record<string, MapaIncidencia[]>>((acc, incidencia) => {
      if (!incidencia.activo_id) return acc
      acc[incidencia.activo_id] = acc[incidencia.activo_id] ?? []
      acc[incidencia.activo_id].push(incidencia)
      return acc
    }, {})
  }, [incidenciasNivel])
  const limpiezasPorActivo = useMemo(() => {
    return limpiezasNivel.reduce<Record<string, MapaLimpieza[]>>((acc, limpieza) => {
      if (!limpieza.activo_id) return acc
      acc[limpieza.activo_id] = acc[limpieza.activo_id] ?? []
      acc[limpieza.activo_id].push(limpieza)
      return acc
    }, {})
  }, [limpiezasNivel])
  const selectedZona = selectedZonaId
    ? editableZonas.find((zona) => zona.id === selectedZonaId) ?? zonas.find((zona) => zona.id === selectedZonaId) ?? null
    : null
  const editingZona = editingZonaId
    ? editableZonas.find((zona) => zona.id === editingZonaId) ?? null
    : null

  useEffect(() => {
    setNewZonaDraft((current) => ({
      ...current,
      area: selectedZona?.area ?? current.area
    }))
  }, [selectedZona?.area])

  const selectedZonaIds = useMemo(() => {
    if (!selectedZona) return null

    const ids = new Set<string>([selectedZona.id])
    const queue = [selectedZona.id]

    while (queue.length) {
      const currentId = queue.shift()
      if (!currentId) continue

      editableZonas.forEach((zona) => {
        if (zona.parent_id === currentId && !ids.has(zona.id)) {
          ids.add(zona.id)
          queue.push(zona.id)
        }
      })
    }

    return ids
  }, [editableZonas, selectedZona])

  const zonasNivelListadas = useMemo(() => {
    const byId = new Map(zonasNivel.map((zona) => [zona.id, zona]))
    const getDepth = (zona: MapaZona) => {
      let depth = 0
      let currentParentId = zona.parent_id

      while (currentParentId) {
        const parent = byId.get(currentParentId)
        if (!parent) break
        depth += 1
        currentParentId = parent.parent_id
      }

      return depth
    }

    return [...zonasNivel].sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'zona' ? -1 : 1
      if ((a.parent_id ?? '') !== (b.parent_id ?? '')) return (a.parent_id ?? '').localeCompare(b.parent_id ?? '')
      if (a.orden !== b.orden) return a.orden - b.orden
      if (getDepth(a) !== getDepth(b)) return getDepth(a) - getDepth(b)
      return (a.nombre || a.label).localeCompare(b.nombre || b.label, 'es')
    })
  }, [zonasNivel])

  const selectedZoneArea = selectedZona?.area ?? null

  const visibleActivos = useMemo(() => {
    if (!selectedZonaIds || !selectedZoneArea) return activosNivelBase

    return activosNivelBase.filter((activo) => {
      if (activo.zona_id) return selectedZonaIds.has(activo.zona_id)
      return (activo.area ?? 'Sin área') === selectedZoneArea
    })
  }, [activosNivelBase, selectedZonaIds, selectedZoneArea])

  const visibleInfraestructura = useMemo(() => {
    if (!selectedZoneArea) return infraestructuraNivelBase
    return infraestructuraNivelBase.filter((item) => (item.area ?? 'Sin área') === selectedZoneArea)
  }, [infraestructuraNivelBase, selectedZoneArea])

  const visibleLimpiezas = useMemo(() => {
    if (!selectedZonaIds || !selectedZoneArea) return limpiezasNivel.filter((limpieza) => limpieza.activo_id || limpieza.zona_id)

    return limpiezasNivel.filter((limpieza) => {
      if (limpieza.zona_id && selectedZonaIds.has(limpieza.zona_id)) return true

      const activo = limpieza.activo_id ? activosPorId[limpieza.activo_id] ?? null : null
      if (activo?.zona_id) return selectedZonaIds.has(activo.zona_id)

      const activoArea = activo?.area ?? limpieza.activo?.area ?? null
      return activoArea === selectedZoneArea
    })
  }, [activosPorId, limpiezasNivel, selectedZonaIds, selectedZoneArea])

  const visibleIncidencias = useMemo(() => {
    if (!selectedZonaIds || !selectedZoneArea) {
      return incidenciasNivel.filter(
        (incidencia) => incidencia.activo_id || incidencia.equipo_id || incidencia.infraestructura_id || incidencia.zona_id
      )
    }

    return incidenciasNivel.filter((incidencia) => {
      if (incidencia.zona_id && selectedZonaIds.has(incidencia.zona_id)) return true

      const activo = incidencia.activo_id ? activosPorId[incidencia.activo_id] ?? null : null
      if (activo?.zona_id) return selectedZonaIds.has(activo.zona_id)
      if (activo?.area === selectedZoneArea) return true

      const item = incidencia.infraestructura_id ? infraestructuraPorId[incidencia.infraestructura_id] ?? null : null
      return item?.area === selectedZoneArea
    })
  }, [activosPorId, incidenciasNivel, infraestructuraPorId, selectedZonaIds, selectedZoneArea])

  const selectedInfraestructura = selectedInfraestructuraId
    ? infraestructura.find((item) => item.id === selectedInfraestructuraId) ?? null
    : null
  const selectedActivo = selectedActivoId
    ? activos.find((activo) => activo.id === selectedActivoId) ?? null
    : null
  const zoomPercent = Math.round(zoom * 100)
  const urgentes = useMemo(
    () => incidenciasNivel.filter((incidencia) => incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente'),
    [incidenciasNivel]
  )
  const revisionesVencidasCount = useMemo(
    () =>
      activosNivelBase.filter((activo) => activo.fecha_proxima_revision && activo.fecha_proxima_revision < today).length +
      infraestructuraNivelBase.filter((item) => item.fecha_proxima_revision && item.fecha_proxima_revision < today).length,
    [activosNivelBase, infraestructuraNivelBase, today]
  )
  const limpiezasAtrasadasCount = useMemo(
    () =>
      activosNivelBase.filter(
        (activo) =>
          activo.limpieza_intervalo_dias &&
          activo.fecha_proxima_limpieza &&
          activo.fecha_proxima_limpieza < today
      ).length,
    [activosNivelBase, today]
  )
  const preventivosProximosCount = useMemo(
    () =>
      activosNivelBase.filter(
        (activo) =>
          (activo.fecha_proxima_revision && getDueSoon(activo.fecha_proxima_revision, today, weekAhead)) ||
          (activo.fecha_proxima_limpieza && getDueSoon(activo.fecha_proxima_limpieza, today, weekAhead))
      ).length +
      infraestructuraNivelBase.filter(
        (item) => item.fecha_proxima_revision && getDueSoon(item.fecha_proxima_revision, today, weekAhead)
      ).length,
    [activosNivelBase, infraestructuraNivelBase, today, weekAhead]
  )
  const zonaAggregateRows = useMemo<ZonaAggregateRow[]>(() => {
    const accumulators = zonasNivel.reduce<Record<string, ZonaAggregateSets>>((acc, zona) => {
      acc[zona.id] = {
        activos: new Set<string>(),
        incidencias: new Set<string>(),
        urgentes: new Set<string>(),
        limpiezas: new Set<string>(),
        preventivos: new Set<string>()
      }
      return acc
    }, {})

    const collectZonaTargets = (zonaId?: string | null, area?: string | null) => {
      const ids = new Set<string>()

      if (zonaId && accumulators[zonaId]) {
        ids.add(zonaId)
        ;(zonaAncestorsById[zonaId] ?? []).forEach((ancestorId) => {
          if (accumulators[ancestorId]) ids.add(ancestorId)
        })
      }

      const normalizedArea = area ?? 'Sin área'
      ;(zonasIdsByArea[normalizedArea] ?? []).forEach((candidateId) => {
        if (accumulators[candidateId]) ids.add(candidateId)
        ;(zonaAncestorsById[candidateId] ?? []).forEach((ancestorId) => {
          if (accumulators[ancestorId]) ids.add(ancestorId)
        })
      })

      return ids
    }

    const registerOnTargets = (
      targetIds: Set<string>,
      bucket: keyof ZonaAggregateSets,
      value: string
    ) => {
      targetIds.forEach((targetId) => {
        accumulators[targetId]?.[bucket].add(value)
      })
    }

    activosNivelBase.forEach((activo) => {
      const targets = collectZonaTargets(activo.zona_id, activo.area)
      registerOnTargets(targets, 'activos', activo.id)

      const hasPreventivoVencido =
        (activo.fecha_proxima_revision && activo.fecha_proxima_revision < today) ||
        (activo.fecha_proxima_limpieza && activo.fecha_proxima_limpieza < today)
      const hasPreventivoProximo =
        getDueSoon(activo.fecha_proxima_revision, today, weekAhead) ||
        getDueSoon(activo.fecha_proxima_limpieza, today, weekAhead)

      if (hasPreventivoVencido || hasPreventivoProximo) {
        registerOnTargets(targets, 'preventivos', activo.id)
      }
    })

    infraestructuraNivelBase.forEach((item) => {
      const targets = collectZonaTargets(null, item.area)
      const hasPreventivoVencido = item.fecha_proxima_revision && item.fecha_proxima_revision < today
      const hasPreventivoProximo = getDueSoon(item.fecha_proxima_revision, today, weekAhead)

      if (hasPreventivoVencido || hasPreventivoProximo) {
        registerOnTargets(targets, 'preventivos', item.id)
      }
    })

    incidenciasNivel.forEach((incidencia) => {
      const activo = incidencia.activo_id ? activosPorId[incidencia.activo_id] ?? null : null
      const item = incidencia.infraestructura_id ? infraestructuraPorId[incidencia.infraestructura_id] ?? null : null
      const targets = collectZonaTargets(incidencia.zona_id ?? activo?.zona_id ?? null, activo?.area ?? item?.area ?? null)
      registerOnTargets(targets, 'incidencias', incidencia.id)

      if (incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente') {
        registerOnTargets(targets, 'urgentes', incidencia.id)
      }
    })

    limpiezasNivel.forEach((limpieza) => {
      const activo = limpieza.activo_id ? activosPorId[limpieza.activo_id] ?? null : null
      const targets = collectZonaTargets(limpieza.zona_id ?? activo?.zona_id ?? null, activo?.area ?? limpieza.activo?.area ?? null)
      registerOnTargets(targets, 'limpiezas', limpieza.id)
    })

    return Object.entries(accumulators).map(([zonaId, buckets]) => ({
      zona_id: zonaId,
      activos: buckets.activos.size,
      incidencias: buckets.incidencias.size,
      urgentes: buckets.urgentes.size,
      limpiezas: buckets.limpiezas.size,
      preventivos: buckets.preventivos.size
    }))
  }, [
    activosNivelBase,
    activosPorId,
    incidenciasNivel,
    infraestructuraNivelBase,
    infraestructuraPorId,
    limpiezasNivel,
    today,
    weekAhead,
    zonaAncestorsById,
    zonasIdsByArea,
    zonasNivel
  ])
  const zonaAggregatesById = useMemo(
    () => buildZonaAggregateMap(zonasNivel, zonaAggregateRows),
    [zonaAggregateRows, zonasNivel]
  )
  const selectedZonaAggregate = selectedZona ? zonaAggregatesById[selectedZona.id] ?? null : null
  const resumenNivel = useMemo(
    () => ({
      zonas: zonasNivel.length,
      activos: activosNivelBase.length,
      infraestructura: infraestructuraNivelBase.length,
      incidencias: incidenciasNivel.length,
      incidenciasUrgentes: urgentes.length,
      pendientes,
      revisionesVencidas: revisionesVencidasCount,
      preventivosProximos: preventivosProximosCount,
      limpiezasAtrasadas: limpiezasAtrasadasCount
    }),
    [
      activosNivelBase.length,
      incidenciasNivel.length,
      infraestructuraNivelBase.length,
      limpiezasAtrasadasCount,
      pendientes,
      preventivosProximosCount,
      revisionesVencidasCount,
      urgentes.length,
      zonasNivel.length
    ]
  )

  function updateZoom(nextZoom: number) {
    setZoom(Number(Math.min(2.5, Math.max(1, nextZoom)).toFixed(2)))
  }

  function deleteZona(id: string) {
    const zonaToDelete = editableZonas.find((z) => z.id === id)
    setEditableZonas((current) => current.filter((z) => z.id !== id))
    if (zonas.some((zona) => zona.id === id)) {
      setDeletedZonaIds((current) => Array.from(new Set([...current, id])))
    }
    if (selectedZonaId === zonaToDelete?.id) setSelectedZonaId(null)
    if (editingZonaId === id) setEditingZonaId(null)
  }

  const updateZona = useCallback((id: string, patch: Partial<MapaZona>) => {
    setEditableZonas((current) => current.map((z) => z.id === id ? { ...z, ...patch } : z))
  }, [])

  const updateZonaGeometry = useCallback((id: string, patch: Partial<ZonaGeometry>) => {
    setEditableZonas((current) =>
      current.map((zona) => {
        if (zona.id !== id) return zona
        const geometry = { ...getZonaGeometry(zona), ...patch }

        return {
          ...zona,
          geometry,
          x: geometry.x,
          y: geometry.y
        }
      })
    )
  }, [])

  const updateZonaPolygon = useCallback((id: string, points: ZonaPoint[]) => {
    const geometry = getPolygonMetrics(points)

    setEditableZonas((current) =>
      current.map((zona) =>
        zona.id === id
          ? {
              ...zona,
              geometry: {
                x: geometry.x,
                y: geometry.y,
                points
              },
              x: geometry.x,
              y: geometry.y
            }
          : zona
      )
    )
  }, [])

  const addPolygonVertex = useCallback((id: string) => {
    setEditableZonas((current) =>
      current.map((zona) => {
        if (zona.id !== id || zona.geometry_tipo !== 'polygon') return zona

        const nextPoints = addPolygonMidpoint(getZonaPolygonPoints(zona))
        const geometry = getPolygonMetrics(nextPoints)

        return {
          ...zona,
          geometry: {
            x: geometry.x,
            y: geometry.y,
            points: nextPoints
          },
          x: geometry.x,
          y: geometry.y
        }
      })
    )
  }, [])

  const removePolygonVertex = useCallback((id: string, pointIndex: number | null = null) => {
    let didUpdate = false
    let nextActiveIndex: number | null = null

    setEditableZonas((current) =>
      current.map((zona) => {
        if (zona.id !== id || zona.geometry_tipo !== 'polygon') return zona

        const currentPoints = getZonaPolygonPoints(zona)
        if (currentPoints.length <= 3) return zona

        const targetIndex = pointIndex !== null ? pointIndex : currentPoints.length - 1
        const nextPoints = currentPoints.filter((_, index) => index !== targetIndex)
        const geometry = getPolygonMetrics(nextPoints)
        didUpdate = true
        nextActiveIndex = nextPoints.length ? Math.min(targetIndex, nextPoints.length - 1) : null

        return {
          ...zona,
          geometry: {
            x: geometry.x,
            y: geometry.y,
            points: nextPoints
          },
          x: geometry.x,
          y: geometry.y
        }
      })
    )

    if (!didUpdate) return

    setActivePolygonVertex(
      nextActiveIndex === null
        ? null
        : {
            zonaId: id,
            pointIndex: nextActiveIndex
          }
    )
  }, [])

  function addZona(draft: NuevaZonaDraft = newZonaDraft) {
    if (!selectedNivel) return

    const trimmedNombre = draft.nombre.trim()
    const fallbackName = `${draft.tipo === 'subzona' ? 'Subzona' : 'Zona'} ${zonasNivel.length + 1}`
    const nombre = trimmedNombre || fallbackName
    const area = draft.area.trim() || nombre
    const newId = crypto.randomUUID()
    const rectGeometry = { x: 50, y: 50, width: 18, height: 12 }
    const geometry =
      draft.geometryTipo === 'rect'
        ? rectGeometry
        : draft.geometryTipo === 'polygon'
          ? { x: 50, y: 50, points: rectToPolygon(rectGeometry) }
          : { x: 50, y: 50 }
    const nextParentId =
      draft.tipo === 'subzona'
        ? selectedZona?.tipo === 'zona'
          ? selectedZona.id
          : selectedZona?.parent_id ?? null
        : null

    setEditableZonas((current) => [
      ...current,
      {
        id: newId,
        nivel_id: selectedNivel.id,
        parent_id: nextParentId,
        area,
        label: nombre,
        nombre,
        tipo: draft.tipo,
        geometry_tipo: draft.geometryTipo,
        geometry,
        color: null,
        descripcion: null,
        x: 50,
        y: 50,
        visible: true,
        orden: current.length * 10,
        created_at: '',
        updated_at: ''
      }
    ])
    setEditingZonaId(newId)
    setSelectedZonaId(newId)
    setNewZonaDraft((current) => ({
      ...current,
      area: selectedZona?.area ?? current.area,
      nombre: '',
      tipo: current.tipo,
      geometryTipo: current.geometryTipo
    }))
  }

  function moveZona(id: string, clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100

    setEditableZonas((current) =>
      current.map((zona) => {
        if (zona.id !== id) return zona

        const nextX = Number(Math.min(100, Math.max(0, x)).toFixed(3))
        const nextY = Number(Math.min(100, Math.max(0, y)).toFixed(3))
        const currentGeometry = getZonaGeometry(zona)

        if (zona.geometry_tipo === 'polygon') {
          const dx = nextX - currentGeometry.x
          const dy = nextY - currentGeometry.y
          const points = getZonaPolygonPoints(zona).map((point) => ({
            x: Math.min(100, Math.max(0, Number((point.x + dx).toFixed(3)))),
            y: Math.min(100, Math.max(0, Number((point.y + dy).toFixed(3))))
          }))
          const polygonGeometry = getPolygonMetrics(points)

          return {
            ...zona,
            x: polygonGeometry.x,
            y: polygonGeometry.y,
            geometry: {
              x: polygonGeometry.x,
              y: polygonGeometry.y,
              points
            }
          }
        }

        return {
          ...zona,
          x: nextX,
          y: nextY,
          geometry: zona.geometry_tipo === 'rect'
            ? {
                ...currentGeometry,
                x: nextX,
                y: nextY
              }
            : {
                x: nextX,
                y: nextY
              }
        }
      })
    )
  }

  function moveZonaPolygonVertex(id: string, pointIndex: number, clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return

    const nextX = Number(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)).toFixed(3))
    const nextY = Number(Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)).toFixed(3))

    setEditableZonas((current) =>
      current.map((zona) => {
        if (zona.id !== id || zona.geometry_tipo !== 'polygon') return zona

        const currentPoints = getZonaPolygonPoints(zona)
        if (!currentPoints[pointIndex]) return zona

        const nextPoints = currentPoints.map((point, index) =>
          index === pointIndex ? { x: nextX, y: nextY } : point
        )
        const geometry = getPolygonMetrics(nextPoints)

        return {
          ...zona,
          geometry: {
            x: geometry.x,
            y: geometry.y,
            points: nextPoints
          },
          x: geometry.x,
          y: geometry.y
        }
      })
    )
  }

  function resizeZonaRect(id: string, corner: RectHandleCorner, clientX: number, clientY: number) {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect) return

    const pointerX = Number(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)).toFixed(3))
    const pointerY = Number(Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)).toFixed(3))
    const minSize = 2

    setEditableZonas((current) =>
      current.map((zona) => {
        if (zona.id !== id || zona.geometry_tipo !== 'rect') return zona

        const geometry = getZonaGeometry(zona)
        const currentLeft = geometry.x - geometry.width / 2
        const currentRight = geometry.x + geometry.width / 2
        const currentTop = geometry.y - geometry.height / 2
        const currentBottom = geometry.y + geometry.height / 2

        let left = currentLeft
        let right = currentRight
        let top = currentTop
        let bottom = currentBottom

        if (corner === 'nw' || corner === 'sw') {
          left = Math.min(Math.max(0, pointerX), right - minSize)
        } else {
          right = Math.max(Math.min(100, pointerX), left + minSize)
        }

        if (corner === 'nw' || corner === 'ne') {
          top = Math.min(Math.max(0, pointerY), bottom - minSize)
        } else {
          bottom = Math.max(Math.min(100, pointerY), top + minSize)
        }

        const nextGeometry = {
          x: Number((((left + right) / 2)).toFixed(3)),
          y: Number((((top + bottom) / 2)).toFixed(3)),
          width: Number((Math.max(minSize, right - left)).toFixed(3)),
          height: Number((Math.max(minSize, bottom - top)).toFixed(3))
        }

        return {
          ...zona,
          geometry: nextGeometry,
          x: nextGeometry.x,
          y: nextGeometry.y
        }
      })
    )
  }

  useEffect(() => {
    if (!editing) {
      dragZonaIdRef.current = null
      dragPolygonVertexRef.current = null
      dragRectHandleRef.current = null
      isDragging.current = false
      setActivePolygonVertex(null)
      setActiveRectHandle(null)
      return
    }

    function handlePointerMove(event: PointerEvent) {
      if (dragRectHandleRef.current) {
        resizeZonaRect(
          dragRectHandleRef.current.zonaId,
          dragRectHandleRef.current.corner,
          event.clientX,
          event.clientY
        )
        return
      }

      if (dragPolygonVertexRef.current) {
        moveZonaPolygonVertex(
          dragPolygonVertexRef.current.zonaId,
          dragPolygonVertexRef.current.pointIndex,
          event.clientX,
          event.clientY
        )
        return
      }

      if (!dragZonaIdRef.current) return
      moveZona(dragZonaIdRef.current, event.clientX, event.clientY)
    }

    function handlePointerUp() {
      if (!dragZonaIdRef.current && !dragPolygonVertexRef.current && !dragRectHandleRef.current) return
      dragZonaIdRef.current = null
      dragPolygonVertexRef.current = null
      dragRectHandleRef.current = null
      isDragging.current = false
      suppressNextClick.current = true
      window.setTimeout(() => {
        suppressNextClick.current = false
      }, 0)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [editing])

  useEffect(() => {
    if (!editingZonaId) {
      setActivePolygonVertex(null)
      setActiveRectHandle(null)
      return
    }

    const zona = editableZonas.find((item) => item.id === editingZonaId)
    if (!zona) {
      setActivePolygonVertex(null)
      setActiveRectHandle(null)
      return
    }

    if (zona.geometry_tipo !== 'polygon') {
      setActivePolygonVertex(null)
    }

    if (zona.geometry_tipo !== 'rect') {
      setActiveRectHandle(null)
    }

    if (zona.geometry_tipo !== 'polygon') return

    const points = getZonaPolygonPoints(zona)
    setActivePolygonVertex((current) => {
      if (!current || current.zonaId !== editingZonaId) return null
      if (current.pointIndex < points.length) return current

      return {
        zonaId: editingZonaId,
        pointIndex: points.length - 1
      }
    })
  }, [editableZonas, editingZonaId])

  const renderedZonas = useMemo<ZonaRenderData[]>(() => {
    return zonasNivel.map((zona) => {
      const aggregate = zonaAggregatesById[zona.id] ?? {
        activos: 0,
        incidencias: 0,
        urgentes: 0,
        limpiezas: 0,
        preventivos: 0,
        tone: 'ok' as ZonaStatusTone
      }

      return {
        zona,
        total: aggregate.activos,
        totalIncidenciasZona: aggregate.incidencias,
        totalLimpiezasZona: aggregate.limpiezas,
        totalUrgentesZona: aggregate.urgentes,
        totalPreventivosZona: aggregate.preventivos,
        tone: aggregate.tone,
        hasIncidencia: aggregate.incidencias > 0,
        hasLimpieza: aggregate.limpiezas > 0,
        isSelected: selectedZonaId === zona.id,
        isEditingThis: editing && editingZonaId === zona.id,
        geometry: getZonaGeometry(zona),
        polygonPoints: getZonaPolygonPoints(zona)
      }
    })
  }, [
    editing,
    editingZonaId,
    selectedZonaId,
    zonaAggregatesById,
    zonasNivel
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Centro operativo</h1>
          <p className="brand-hint">El mapa limpio ya funciona como dashboard visual del restaurante.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className={mutedButtonClass}
          >
            {editing ? 'Salir de edición' : 'Editar mapa'}
          </button>
          <Link href="/activos/nuevo" className="brand-button">
            Nuevo activo
          </Link>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ResumenCard
          title="Sin asignar"
          value={resumenNivel.pendientes.length}
          detail="Reportes que aún no están ubicados"
          tone="orange"
          href="/incidencias?estado=sin_asignar"
        />
        <ResumenCard
          title="Urgentes activas"
          value={resumenNivel.incidenciasUrgentes}
          detail={`${resumenNivel.incidencias} incidencias abiertas en ${selectedNivel?.nombre ?? 'el nivel'}`}
          tone="red"
          href="/incidencias?estado=activas&prioridad=alta_urgente"
        />
        <ResumenCard
          title="Revisiones vencidas"
          value={resumenNivel.revisionesVencidas}
          detail="Activos o infraestructura fuera de fecha"
          tone="yellow"
          href="/activos"
        />
        <ResumenCard
          title="Preventivos próximos"
          value={resumenNivel.preventivosProximos}
          detail={`${resumenNivel.limpiezasAtrasadas} limpiezas atrasadas en el nivel`}
          tone="teal"
          href="/activos?limpieza=atrasadas"
        />
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {niveles.map((nivel) => (
          <button
            key={nivel.id}
            type="button"
              onClick={() => {
                setSelectedNivelId(nivel.id)
                setSelectedZonaId(null)
                setSelectedActivoId(null)
                setSelectedInfraestructuraId(null)
              }}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${
              selectedNivel?.id === nivel.id
                ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                : 'border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-bone)_92%,white)]'
            }`}
          >
            {nivel.nombre}
          </button>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[linear-gradient(145deg,rgba(255,253,248,0.98),rgba(244,245,240,0.96))] shadow-[0_24px_80px_-48px_rgba(47,62,30,0.55)] dark:bg-[linear-gradient(145deg,rgba(24,31,22,0.98),rgba(14,18,13,0.98))]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] bg-[linear-gradient(90deg,rgba(47,62,30,0.05),rgba(255,253,248,0.25),rgba(155,30,33,0.05))] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[color:color-mix(in_srgb,var(--brand-olive)_20%,transparent)] bg-[rgba(255,253,248,0.75)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-olive)] dark:bg-[rgba(24,31,22,0.72)]">
                {selectedNivel?.nombre ?? 'Sin nivel'}
              </span>
              <span className="text-sm font-medium text-[color:var(--brand-olive)]">Zoom {zoomPercent}%</span>
              <div className="flex rounded-md border border-[color:var(--brand-border)] bg-[rgba(255,253,248,0.72)] p-1 dark:bg-[rgba(22,32,18,0.72)]">
                <button
                  type="button"
                  onClick={() => setViewMode('operativo')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    viewMode === 'operativo'
                      ? 'bg-[color:var(--brand-green)] text-[color:var(--brand-bone)]'
                      : 'text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]'
                  }`}
                >
                  Operativo
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('arquitectonico')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    viewMode === 'arquitectonico'
                      ? 'bg-[color:var(--brand-green)] text-[color:var(--brand-bone)]'
                      : 'text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]'
                  }`}
                >
                  Referencia
                </button>
              </div>
              <LayerToggle label="Zonas" active={showZonas} onClick={() => setShowZonas((value) => !value)} />
              <LayerToggle label="Activos" active={showActivos} onClick={() => setShowActivos((value) => !value)} />
              <LayerToggle label="Infra" active={showInfraestructura} onClick={() => setShowInfraestructura((value) => !value)} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateZoom(zoom - 0.25)}
                className={`${mutedButtonClass} px-3 py-1.5 disabled:opacity-40`}
                disabled={zoom <= 1}
              >
                -
              </button>
              <button
                type="button"
                onClick={() => updateZoom(1)}
                className={`${mutedButtonClass} px-3 py-1.5`}
              >
                100%
              </button>
              <button
                type="button"
                onClick={() => updateZoom(zoom + 0.25)}
                className={`${mutedButtonClass} px-3 py-1.5 disabled:opacity-40`}
                disabled={zoom >= 2.5}
              >
                +
              </button>
            </div>
          </div>
          <div className="max-h-[72vh] overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(239,169,30,0.06),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(155,30,33,0.08),transparent_32%)]">
            <div
              ref={mapRef}
              className="relative min-w-full"
              style={{ width: `${zoom * 100}%` }}
              onClick={() => editing && setEditingZonaId(null)}
            >
              {selectedNivel ? (
                viewMode === 'arquitectonico' ? (
                  <Image
                    src={selectedNivel.imagen_url}
                    alt={selectedNivel.nombre}
                    width={1366}
                    height={768}
                    className="block w-full select-none"
                    priority
                  />
                ) : (
                  <SchematicLevelCanvas
                    nivelNombre={selectedNivel.nombre}
                    totalZonas={resumenNivel.zonas}
                    totalActivos={resumenNivel.activos}
                    totalInfraestructura={resumenNivel.infraestructura}
                    totalIncidencias={resumenNivel.incidencias}
                    totalUrgentes={resumenNivel.incidenciasUrgentes}
                  />
                )
              ) : (
                <div className="flex h-96 items-center justify-center bg-[color:color-mix(in_srgb,var(--brand-bone)_86%,white)] text-sm text-[color:var(--brand-muted)]">
                  Sin láminas cargadas.
                </div>
              )}
              <MapOperationalHud
                nivelNombre={selectedNivel?.nombre ?? 'Sin nivel'}
                selectedZona={selectedZona}
                selectedZonaAggregate={selectedZonaAggregate}
                visibleActivosCount={visibleActivos.length}
                visibleIncidenciasCount={visibleIncidencias.length}
                visibleLimpiezasCount={visibleLimpiezas.length}
                visibleInfraCount={visibleInfraestructura.length}
                preventivosProximosCount={resumenNivel.preventivosProximos}
                editing={editing}
                viewMode={viewMode}
              />
              {showZonas ? (
                <MapaZonasOverlay
                  zonas={renderedZonas}
                  editing={editing}
                  viewMode={viewMode}
                  activePolygonVertex={activePolygonVertex}
                  activeRectHandle={activeRectHandle}
                  onZonaClick={(zonaId, isEditingThis) => {
                    if (suppressNextClick.current) return
                    if (editing) {
                      if (!isDragging.current) {
                        setEditingZonaId(isEditingThis ? null : zonaId)
                        setSelectedZonaId(zonaId)
                      }
                    } else {
                      setSelectedZonaId((current) => (current === zonaId ? null : zonaId))
                      setSelectedActivoId(null)
                      setSelectedInfraestructuraId(null)
                    }
                  }}
                  onDragHandlePointerDown={(zonaId) => {
                    if (!editing) return
                    dragZonaIdRef.current = zonaId
                    isDragging.current = true
                  }}
                  onPolygonVertexPointerDown={(zonaId, pointIndex) => {
                    if (!editing) return
                    dragPolygonVertexRef.current = { zonaId, pointIndex }
                    isDragging.current = true
                    setEditingZonaId(zonaId)
                    setActivePolygonVertex({ zonaId, pointIndex })
                  }}
                  onRectHandlePointerDown={(zonaId, corner) => {
                    if (!editing) return
                    dragRectHandleRef.current = { zonaId, corner }
                    isDragging.current = true
                    setEditingZonaId(zonaId)
                    setSelectedZonaId(zonaId)
                    setActiveRectHandle({ zonaId, corner })
                  }}
                />
              ) : null}
            {!editing && showActivos && activosNivel.map((activo) => {
              const active = (incidenciasPorActivo[activo.id]?.length ?? 0) > 0
              const hasLimpieza = (limpiezasPorActivo[activo.id]?.length ?? 0) > 0
              const selected = selectedActivoId === activo.id

              return (
                <button
                  key={activo.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedZonaId(null)
                    setSelectedInfraestructuraId(null)
                    setSelectedActivoId(selected ? null : activo.id)
                  }}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition-transform hover:scale-125 ${
                    selected
                      ? 'h-5 w-5 border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] ring-2 ring-[rgba(255,253,248,0.9)]'
                      : active
                        ? 'h-4 w-4 border-rose-600 bg-rose-400'
                        : hasLimpieza || activo.limpieza_intervalo_dias
                          ? 'h-4 w-4 border-teal-600 bg-teal-400'
                          : 'h-4 w-4 border-[color:var(--brand-gold)] bg-[color:var(--brand-gold)]'
                  }`}
                  style={{ left: `${activo.x}%`, top: `${activo.y}%` }}
                  aria-label={activo.nombre}
                >
                  <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_16%,transparent)] bg-[rgba(255,253,248,0.92)] px-2 py-1 text-xs font-semibold text-[color:var(--brand-ink)] shadow-sm group-hover:block">
                    {activo.nombre}
                  </span>
                </button>
              )
            })}
            {!editing && showInfraestructura && infraestructuraNivel.map((item) => {
              const active = incidenciasNivel.some((incidencia) => incidencia.infraestructura_id === item.id)
              const selected = selectedInfraestructuraId === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedZonaId(null)
                    setSelectedInfraestructuraId(selected ? null : item.id)
                  }}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-xs font-semibold shadow-sm ${
                    selected
                      ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                      : active
                        ? 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300'
                        : 'border-[color:color-mix(in_srgb,var(--brand-gold)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-gold)_14%,white)] text-[color:var(--brand-olive)] dark:bg-[rgba(90,65,24,0.82)] dark:border-[rgba(239,169,30,0.22)] dark:text-[rgba(255,223,130,0.96)]'
                  }`}
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                >
                  {item.tipo}
                  <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_16%,transparent)] bg-[rgba(255,253,248,0.92)] px-2 py-1 text-xs font-semibold text-[color:var(--brand-ink)] shadow-sm group-hover:block">
                    {item.nombre}
                  </span>
                </button>
              )
            })}
            </div>
          </div>
        </div>

	        <aside className="brand-card p-4">
          {editing ? (
            <form action={formAction} className="space-y-4">
              <div>
                <h2 className="font-semibold text-[color:var(--brand-ink)]">Editar mapa</h2>
                <p className="brand-hint">Selecciona una zona en la lámina o en la lista. La edición detallada vive aquí para que no se corte dentro del mapa.</p>
              </div>
              <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[linear-gradient(180deg,rgba(255,253,248,0.76),rgba(244,245,240,0.9))] p-3 dark:bg-[linear-gradient(180deg,rgba(31,39,29,0.92),rgba(20,27,18,0.96))]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--brand-ink)]">Nueva zona</h3>
                    <p className="mt-1 text-xs text-[color:var(--brand-muted)]">
                      {selectedZona
                        ? `Se propone dentro de ${selectedZona.nombre || selectedZona.label}.`
                        : 'Empieza con nombre, tipo y figura antes de dibujar.'}
                    </p>
                  </div>
                  <span className="rounded-full bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-olive)]">
                    Plantilla
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-[color:var(--brand-muted)]">Nombre visible</span>
                    <input
                      type="text"
                      value={newZonaDraft.nombre}
                      onChange={(e) => setNewZonaDraft((current) => ({ ...current, nombre: e.target.value }))}
                      placeholder="Ej. Barra fría, cuarto técnico..."
                      className="brand-field mt-1 w-full px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-[color:var(--brand-muted)]">Área</span>
                    <input
                      type="text"
                      list="areas-nueva-zona"
                      value={newZonaDraft.area}
                      onChange={(e) => setNewZonaDraft((current) => ({ ...current, area: e.target.value }))}
                      placeholder="Área operativa"
                      className="brand-field mt-1 w-full px-3 py-2 text-sm"
                    />
                    <datalist id="areas-nueva-zona">
                      {areas.map((area) => (
                        <option key={area} value={area} />
                      ))}
                    </datalist>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--brand-muted)]">Tipo</span>
                      <select
                        value={newZonaDraft.tipo}
                        onChange={(e) =>
                          setNewZonaDraft((current) => ({
                            ...current,
                            tipo: e.target.value as MapaZona['tipo']
                          }))
                        }
                        className="brand-field mt-1 w-full px-3 py-2 text-sm"
                      >
                        <option value="zona">Zona</option>
                        <option value="subzona">Subzona</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--brand-muted)]">Figura</span>
                      <select
                        value={newZonaDraft.geometryTipo}
                        onChange={(e) =>
                          setNewZonaDraft((current) => ({
                            ...current,
                            geometryTipo: e.target.value as MapaZona['geometry_tipo']
                          }))
                        }
                        className="brand-field mt-1 w-full px-3 py-2 text-sm"
                      >
                        <option value="rect">Rectángulo</option>
                        <option value="polygon">Polígono</option>
                        <option value="point">Punto</option>
                      </select>
                    </label>
                  </div>
                  {newZonaDraft.tipo === 'subzona' && !selectedZona ? (
                    <p className="rounded-xl bg-[rgba(239,169,30,0.1)] px-3 py-2 text-xs text-[#8f5a00]">
                      Selecciona primero una zona si quieres crear la subzona ya vinculada a su padre.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => addZona()}
                    className="brand-button w-full"
                  >
                    + Crear zona base
                  </button>
                </div>
              </section>
              <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] p-3 dark:bg-[rgba(19,25,17,0.94)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[color:var(--brand-ink)]">Zonas del nivel</h3>
                    <p className="mt-1 text-xs text-[color:var(--brand-muted)]">
                      {selectedNivel?.nombre ?? 'Sin nivel'} · {zonasNivelListadas.length} registradas
                    </p>
                  </div>
                  <span className="rounded-full bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-olive)]">
                    Navegación
                  </span>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                  {zonasNivelListadas.length ? (
                    zonasNivelListadas.map((zona) => (
                      <button
                        key={zona.id}
                        type="button"
                        onClick={() => {
                          setEditingZonaId(zona.id)
                          setSelectedZonaId(zona.id)
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                          editingZonaId === zona.id
                            ? 'border-[color:var(--brand-wine)] bg-[color:color-mix(in_srgb,var(--brand-wine)_9%,white)]'
                            : 'border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] bg-[rgba(255,253,248,0.72)] hover:border-[color:color-mix(in_srgb,var(--brand-olive)_28%,transparent)] dark:bg-[rgba(28,35,25,0.88)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[color:var(--brand-ink)]">
                              {zona.parent_id ? '└ ' : ''}{zona.nombre || zona.label}
                            </p>
                            <p className="mt-1 truncate text-xs text-[color:var(--brand-muted)]">
                              {zona.area} · {zona.tipo === 'subzona' ? 'Subzona' : 'Zona'} · {zona.geometry_tipo}
                            </p>
                          </div>
                          <span className="rounded-full bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-olive)]">
                            #{Math.max(1, zona.orden / 10 + 1)}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--brand-muted)]">No hay zonas creadas todavía en este nivel.</p>
                  )}
                </div>
              </section>
              {editingZona ? (
                <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] p-3 dark:bg-[rgba(19,25,17,0.94)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[color:var(--brand-ink)]">Zona seleccionada</h3>
                      <p className="mt-1 text-xs text-[color:var(--brand-muted)]">
                        Ajusta texto, jerarquía y geometría sin depender del popup sobre la lámina.
                      </p>
                    </div>
                    <span className="rounded-full bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-wine)]">
                      {editingZona.geometry_tipo}
                    </span>
                  </div>
                  <div className="mt-3 space-y-3">
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--brand-muted)]">Nombre visible</span>
                      <input
                        type="text"
                        value={editingZona.nombre}
                        className="brand-field mt-1 w-full px-3 py-2 text-sm"
                        onChange={(e) => updateZona(editingZona.id, { nombre: e.target.value, label: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--brand-muted)]">Área</span>
                      <input
                        type="text"
                        list={`areas-${editingZona.id}`}
                        value={editingZona.area}
                        className="brand-field mt-1 w-full px-3 py-2 text-sm"
                        onChange={(e) => updateZona(editingZona.id, { area: e.target.value })}
                        onBlur={(e) => {
                          const value = e.target.value.trim()
                          updateZona(editingZona.id, { area: value || editingZona.nombre, label: editingZona.label || editingZona.nombre })
                        }}
                      />
                      <datalist id={`areas-${editingZona.id}`}>
                        {areas.map((area) => (
                          <option key={area} value={area} />
                        ))}
                      </datalist>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--brand-muted)]">Descripción</span>
                      <textarea
                        rows={4}
                        value={editingZona.descripcion ?? ''}
                        className="brand-field mt-1 w-full px-3 py-2 text-sm"
                        placeholder="Uso operativo, notas rápidas, cobertura o restricciones."
                        onChange={(e) => updateZona(editingZona.id, { descripcion: e.target.value })}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-xs font-medium text-[color:var(--brand-muted)]">Tipo</span>
                        <select
                          value={editingZona.tipo}
                          onChange={(e) =>
                            updateZona(editingZona.id, {
                              tipo: e.target.value as MapaZona['tipo'],
                              parent_id: e.target.value === 'zona' ? null : editingZona.parent_id
                            })
                          }
                          className="brand-field mt-1 w-full px-3 py-2 text-sm"
                        >
                          <option value="zona">Zona</option>
                          <option value="subzona">Subzona</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-[color:var(--brand-muted)]">Figura</span>
                        <select
                          value={editingZona.geometry_tipo}
                          onChange={(e) => {
                            const nextType = e.target.value as MapaZona['geometry_tipo']
                            const nextGeometry = getZonaGeometry(editingZona)
                            updateZona(editingZona.id, {
                              geometry_tipo: nextType,
                              geometry: nextType === 'rect'
                                ? nextGeometry
                                : nextType === 'polygon'
                                  ? { x: nextGeometry.x, y: nextGeometry.y, points: getZonaPolygonPoints(editingZona) }
                                  : { x: nextGeometry.x, y: nextGeometry.y }
                            })
                          }}
                          className="brand-field mt-1 w-full px-3 py-2 text-sm"
                        >
                          <option value="point">Punto</option>
                          <option value="rect">Rectángulo</option>
                          <option value="polygon">Polígono</option>
                        </select>
                      </label>
                    </div>
                    {editingZona.tipo === 'subzona' ? (
                      <label className="block">
                        <span className="text-xs font-medium text-[color:var(--brand-muted)]">Zona padre</span>
                        <select
                          value={editingZona.parent_id ?? ''}
                          onChange={(e) => updateZona(editingZona.id, { parent_id: e.target.value || null })}
                          className="brand-field mt-1 w-full px-3 py-2 text-sm"
                        >
                          <option value="">Sin zona padre</option>
                          {zonasNivel
                            .filter((candidate) => candidate.id !== editingZona.id && candidate.tipo === 'zona')
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.nombre}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                    {editingZona.geometry_tipo === 'rect' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-xs font-medium text-[color:var(--brand-muted)]">Ancho %</span>
                          <input
                            type="number"
                            min="2"
                            max="100"
                            step="0.5"
                            value={getZonaGeometry(editingZona).width}
                            onChange={(e) => updateZonaGeometry(editingZona.id, { width: Number(e.target.value) })}
                            className="brand-field mt-1 w-full px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-[color:var(--brand-muted)]">Alto %</span>
                          <input
                            type="number"
                            min="2"
                            max="100"
                            step="0.5"
                            value={getZonaGeometry(editingZona).height}
                            onChange={(e) => updateZonaGeometry(editingZona.id, { height: Number(e.target.value) })}
                            className="brand-field mt-1 w-full px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    ) : null}
                    {editingZona.geometry_tipo === 'polygon' ? (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => addPolygonVertex(editingZona.id)}
                            className={`flex-1 ${mutedButtonClass}`}
                          >
                            + Vértice
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              removePolygonVertex(
                                editingZona.id,
                                activePolygonVertex?.zonaId === editingZona.id ? activePolygonVertex.pointIndex : null
                              )
                            }
                            disabled={getZonaPolygonPoints(editingZona).length <= 3}
                            className={`${wineButtonClass} flex-1 disabled:cursor-not-allowed disabled:opacity-40`}
                          >
                            - Vértice
                          </button>
                        </div>
                        <label className="block">
                          <span className="text-xs font-medium text-[color:var(--brand-muted)]">Puntos del polígono</span>
                          <textarea
                            key={`${editingZona.id}-${serializePolygonPoints(getZonaPolygonPoints(editingZona))}`}
                            defaultValue={serializePolygonPoints(getZonaPolygonPoints(editingZona))}
                            rows={6}
                            className="brand-field mt-1 w-full px-3 py-2 text-sm"
                            onBlur={(e) => {
                              const points = parsePolygonPoints(e.target.value)
                              if (points) updateZonaPolygon(editingZona.id, points)
                            }}
                          />
                          <span className="brand-hint mt-1 block">Arrastra los vértices o edita una coordenada por línea: `x, y`.</span>
                        </label>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteZona(editingZona.id)}
                      className="w-full rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-wine)] hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)]"
                    >
                      Desactivar zona
                    </button>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[rgba(255,253,248,0.66)] p-4 text-sm text-[color:var(--brand-muted)] dark:bg-[rgba(19,25,17,0.9)]">
                  Selecciona una zona del mapa o de la lista para editar su detalle completo.
                </section>
              )}
              <FormError message={state.error} />
              <input
                type="hidden"
	                name="zonas"
	                value={JSON.stringify(
	                  editableZonas.map((zona) => {
	                    const geometry = getZonaGeometry(zona)

	                    return {
	                      id: zona.id,
	                      nivel_id: zona.nivel_id,
	                      parent_id: zona.parent_id,
	                      area: zona.area,
	                      label: zona.label,
	                      nombre: zona.nombre,
                        descripcion: zona.descripcion,
                        color: zona.color,
	                      tipo: zona.tipo,
	                      geometry_tipo: zona.geometry_tipo,
		                      geometry: zona.geometry_tipo === 'rect'
		                        ? geometry
                            : zona.geometry_tipo === 'polygon'
                              ? { x: geometry.x, y: geometry.y, points: getZonaPolygonPoints(zona) }
		                        : { x: geometry.x, y: geometry.y },
	                      x: zona.x,
	                      y: zona.y
	                    }
	                  })
	                )}
	              />
              <input type="hidden" name="deleted_zona_ids" value={JSON.stringify(deletedZonaIds)} />
              <button
                type="submit"
                className="brand-button w-full"
              >
                Guardar mapa
              </button>
            </form>
          ) : (
            selectedActivo ? (
              <ActivoPanel
                activo={selectedActivo}
                incidencias={incidenciasPorActivo[selectedActivo.id] ?? []}
                limpiezas={limpiezasPorActivo[selectedActivo.id] ?? []}
              />
            ) : selectedInfraestructura ? (
              <InfraestructuraPanel item={selectedInfraestructura} />
            ) : (
              <ActivoListaPanel
                resumenNivel={resumenNivel}
                activos={visibleActivos}
                infraestructura={visibleInfraestructura}
                incidencias={visibleIncidencias}
                limpiezas={visibleLimpiezas}
                zonas={selectedZonaIds ? editableZonas.filter((zona) => selectedZonaIds.has(zona.id)) : zonasNivel}
                incidenciasSinUbicacion={selectedZona ? [] : incidenciasSinUbicacion}
                limpiezasSinUbicacion={selectedZona ? [] : limpiezasSinUbicacion}
                selectedZona={selectedZona}
                selectedZonaAggregate={selectedZonaAggregate}
                incidenciasPorActivo={incidenciasPorActivo}
                limpiezasPorActivo={limpiezasPorActivo}
                onClearZona={() => setSelectedZonaId(null)}
              />
            )
          )}
        </aside>
      </section>
    </div>
  )
}

function ActivoListaPanel({
  resumenNivel,
  activos,
  infraestructura,
  incidencias,
  limpiezas,
  zonas,
  incidenciasSinUbicacion,
  limpiezasSinUbicacion,
  selectedZona,
  selectedZonaAggregate,
  incidenciasPorActivo,
  limpiezasPorActivo,
  onClearZona
}: {
  resumenNivel: {
    zonas: number
    activos: number
    infraestructura: number
    incidencias: number
    incidenciasUrgentes: number
    pendientes: MapaPendiente[]
    revisionesVencidas: number
    preventivosProximos: number
    limpiezasAtrasadas: number
  }
  activos: MapaActivo[]
  infraestructura: MapaInfraestructura[]
  incidencias: MapaIncidencia[]
  limpiezas: MapaLimpieza[]
  zonas: MapaZona[]
  incidenciasSinUbicacion: MapaIncidencia[]
  limpiezasSinUbicacion: MapaLimpieza[]
  selectedZona: MapaZona | null
  selectedZonaAggregate: ZonaAggregate | null
  incidenciasPorActivo: Record<string, MapaIncidencia[]>
  limpiezasPorActivo: Record<string, MapaLimpieza[]>
  onClearZona: () => void
}) {
  const router = useRouter()
  const [showNuevoActivo, setShowNuevoActivo] = useState(false)
  const [nuevoActivoState, nuevoActivoAction] = useFormState(
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

  const primaryZona = zonas[0]
  const heading = selectedZona ? selectedZona.nombre || selectedZona.label : 'Visión general'
  const subtitle = selectedZona
    ? `${selectedZona.tipo === 'subzona' ? 'Subzona' : 'Zona'} · ${selectedZona.area}`
    : `${resumenNivel.activos} activos · ${resumenNivel.infraestructura} infraestructura · ${resumenNivel.incidencias} incidencias · ${resumenNivel.zonas} zonas`

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[color:var(--brand-ink)]">{heading}</h2>
          <p className="text-sm text-[color:var(--brand-muted)]">{subtitle}</p>
        </div>
        {selectedZona ? (
          <button
            type="button"
            onClick={onClearZona}
            className={mutedButtonClass}
          >
            Ver todo
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={selectedZona && primaryZona ? `/incidencias/nueva?zona=${primaryZona.id}` : '/incidencias/nueva'} className={wineButtonClass}>
          Nueva incidencia
        </Link>
        <Link
          href={selectedZona && primaryZona ? `/mantenimientos/nuevo?tipo=limpieza_profunda&zona=${primaryZona.id}` : '/mantenimientos/nuevo?tipo=limpieza_profunda'}
          className={oliveButtonClass}
        >
          Nueva limpieza
        </Link>
        <Link href="/mantenimientos?tipo=limpieza_profunda" className={mutedButtonClass}>
          Ver limpiezas
        </Link>
        {selectedZona && primaryZona ? (
          <button type="button" onClick={() => setShowNuevoActivo(true)} className={oliveButtonClass}>
            Nuevo activo aquí
          </button>
        ) : null}
      </div>

      {showNuevoActivo && primaryZona ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNuevoActivo(false)}>
          <div className="w-full max-w-md rounded-xl border border-[color:var(--brand-border)] bg-[color:var(--brand-paper)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-[color:var(--brand-ink)]">Nuevo activo en {primaryZona.nombre || primaryZona.label}</h3>
              <button type="button" onClick={() => setShowNuevoActivo(false)} className="text-[color:var(--brand-muted)] hover:text-[color:var(--brand-ink)]">✕</button>
            </div>
            {nuevoActivoState.error ? (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{nuevoActivoState.error}</p>
            ) : null}
            <form action={nuevoActivoAction} className="space-y-3">
              <input type="hidden" name="zona_id" value={primaryZona.id} />
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--brand-muted)]">Nombre *</span>
                <input
                  name="nombre"
                  required
                  placeholder="ej. Freidora principal"
                  className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] placeholder-[color:var(--brand-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-[color:var(--brand-muted)]">Clase *</span>
                  <select
                    name="clase"
                    required
                    className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Seleccionar</option>
                    {(['equipo', 'infraestructura', 'mobiliario', 'edificacion', 'sistema'] as const).map((c) => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-[color:var(--brand-muted)]">Tipo *</span>
                  <input
                    name="tipo"
                    required
                    placeholder="ej. Freidora"
                    className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] placeholder-[color:var(--brand-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--brand-muted)]">Área</span>
                <select
                  name="area"
                  className="mt-0.5 w-full rounded-md border border-[color:var(--brand-border)] bg-white px-3 py-2 text-sm text-[color:var(--brand-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-olive)] dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Sin área</option>
                  {equipoAreas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowNuevoActivo(false)} className={mutedButtonClass}>
                  Cancelar
                </button>
                <button type="submit" className={oliveButtonClass}>
                  Crear activo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {!selectedZona ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Atención inmediata</h3>
            {resumenNivel.pendientes.slice(0, 3).map((pendiente) => (
              <Link
                key={pendiente.id}
                href={`/incidencias/${pendiente.id}`}
                className="block rounded-md border border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] p-3 text-sm text-[#8f5a00] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]"
              >
                <span className="font-medium">{pendiente.ticket_numero} · {pendiente.descripcion}</span>
                <span className="mt-1 block text-xs">
                  Sin asignar · {formatDate(pendiente.fecha_reporte)}
                </span>
              </Link>
            ))}
            {incidencias
              .filter((incidencia) => incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente')
              .slice(0, 2)
              .map((incidencia) => (
              <IncidenciaLink key={incidencia.id} incidencia={incidencia} />
            ))}
            {(resumenNivel.pendientes.length === 0 &&
              incidencias.every((incidencia) => incidencia.prioridad !== 'alta' && incidencia.prioridad !== 'urgente')) ? (
              <p className="text-sm text-[color:var(--brand-muted)]">No hay alertas inmediatas.</p>
            ) : null}
          </div>
        ) : null}

        {!selectedZona ? (
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Sin asignar" value={resumenNivel.pendientes.length} tone="orange" />
            <MiniMetric label="Urgentes" value={resumenNivel.incidenciasUrgentes} tone="red" />
            <MiniMetric label="Vencidas" value={resumenNivel.revisionesVencidas} tone="yellow" />
            <MiniMetric label="Preventivos" value={resumenNivel.preventivosProximos} tone="teal" />
          </div>
        ) : null}

        {selectedZona && selectedZonaAggregate ? (
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Activos" value={selectedZonaAggregate.activos} tone="orange" />
            <MiniMetric label="Incidencias" value={selectedZonaAggregate.incidencias} tone="red" />
            <MiniMetric label="Limpiezas" value={selectedZonaAggregate.limpiezas} tone="teal" />
            <MiniMetric label="Preventivos" value={selectedZonaAggregate.preventivos} tone="yellow" />
          </div>
        ) : null}

        {incidencias.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Incidencias activas</h3>
            {incidencias.slice(0, 5).map((incidencia) => (
              <IncidenciaLink key={incidencia.id} incidencia={incidencia} />
            ))}
          </div>
        ) : null}

        {incidenciasSinUbicacion.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Incidencias sin ubicación</h3>
            {incidenciasSinUbicacion.slice(0, 4).map((incidencia) => (
              <IncidenciaLink key={incidencia.id} incidencia={incidencia} />
            ))}
          </div>
        ) : null}

        {limpiezas.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Limpiezas profundas</h3>
            {limpiezas.slice(0, 5).map((limpieza) => (
              <LimpiezaLink key={limpieza.id} limpieza={limpieza} />
            ))}
          </div>
        ) : null}

        {limpiezasSinUbicacion.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Sin ubicación</h3>
            {limpiezasSinUbicacion.slice(0, 4).map((limpieza) => (
              <LimpiezaLink key={limpieza.id} limpieza={limpieza} />
            ))}
          </div>
        ) : null}

        {infraestructura.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand-muted)]">Infraestructura</h3>
            {infraestructura.slice(0, 8).map((item) => (
              <Link
                key={item.id}
                href={`/infraestructura/${item.id}`}
                className="block rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_72%,white)] p-3 transition hover:border-[color:var(--brand-wine)]"
              >
                <span className="font-medium text-[color:var(--brand-ink)]">{item.nombre}</span>
                <span className="mt-1 block text-sm text-[color:var(--brand-muted)]">
                  {item.area ?? 'Sin área'} · {item.tipo}
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        {activos.length ? (
          activos.map((activo) => {
            const activoIncidencias = incidenciasPorActivo[activo.id] ?? []
            const activoLimpiezas = limpiezasPorActivo[activo.id] ?? []

            return (
              <article
                key={activo.id}
                className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_72%,white)] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge type={activo.clase === 'equipo' ? 'equipo' : 'infraestructura'} value={activo.estado} />
                  {activoIncidencias.length ? (
                    <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-wine)]">
                      {activoIncidencias.length} incidencia{activoIncidencias.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {activoLimpiezas.length ? (
                    <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-olive)]">
                      {activoLimpiezas.length} limpieza{activoLimpiezas.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                <Link href={`/activos/${activo.id}`} className="mt-2 block font-medium text-[color:var(--brand-ink)] hover:underline">
                  {activo.nombre}
                </Link>
                <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                  {activo.area ?? 'Sin área'} · {activo.tipo}
                </p>
                <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                  Próxima revisión: {formatDate(activo.fecha_proxima_revision)}
                </p>
                {activoIncidencias.length ? (
                  <div className="mt-2 space-y-1">
                    {activoIncidencias.slice(0, 2).map((incidencia) => (
                      <Link
                        key={incidencia.id}
                        href={`/incidencias/${incidencia.id}`}
                        className="block text-sm font-medium text-[color:var(--brand-wine)] hover:underline"
                      >
                        {incidencia.ticket_numero} · {incidencia.descripcion}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {activoLimpiezas.length ? (
                  <div className="mt-2 space-y-1">
                    {activoLimpiezas.slice(0, 2).map((limpieza) => (
                      <Link
                        key={limpieza.id}
                        href={`/mantenimientos/${limpieza.id}`}
                        className="block text-sm font-medium text-[color:var(--brand-olive)] hover:underline"
                      >
                        {formatDate(limpieza.fecha_realizacion)} · {limpieza.descripcion}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })
        ) : (
          <p className="text-sm text-[color:var(--brand-muted)]">No hay activos en esta área.</p>
        )}
      </div>
    </>
  )
}

function MapaZonasOverlay({
  zonas,
  editing,
  viewMode,
  activePolygonVertex,
  activeRectHandle,
  onZonaClick,
  onDragHandlePointerDown,
  onPolygonVertexPointerDown,
  onRectHandlePointerDown
}: {
  zonas: ZonaRenderData[]
  editing: boolean
  viewMode: 'operativo' | 'arquitectonico'
  activePolygonVertex: { zonaId: string; pointIndex: number } | null
  activeRectHandle: { zonaId: string; corner: RectHandleCorner } | null
  onZonaClick: (zonaId: string, isEditingThis: boolean) => void
  onDragHandlePointerDown: (zonaId: string) => void
  onPolygonVertexPointerDown: (zonaId: string, pointIndex: number) => void
  onRectHandlePointerDown: (zonaId: string, corner: RectHandleCorner) => void
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {zonas.map(
        ({
          zona,
          geometry,
          polygonPoints,
          isSelected,
          isEditingThis,
          total,
          totalIncidenciasZona,
          totalLimpiezasZona,
          totalUrgentesZona,
          totalPreventivosZona,
          tone
        }) => {
        const visual = getZonaVisual({
          isSelected,
          tone,
          hasUrgentes: totalUrgentesZona > 0,
          isSubzona: zona.tipo === 'subzona',
          viewMode
        })
        const label = `${zona.label}${total ? ` ${total}` : ''}`
        const showAreaShape = zona.geometry_tipo === 'rect' || zona.geometry_tipo === 'polygon'

        return (
          <g key={zona.id}>
            {zona.geometry_tipo === 'rect' ? (
              <>
                <rect
                  x={geometry.x - geometry.width / 2}
                  y={geometry.y - geometry.height / 2}
                  width={geometry.width}
                  height={geometry.height}
                  rx={1.2}
                  ry={1.2}
                  fill={visual.rectFill}
                  stroke={visual.rectStroke}
                  strokeWidth={isSelected ? 0.35 : 0.22}
                  className="cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation()
                    onZonaClick(zona.id, isEditingThis)
                  }}
                />
                <g
                  className="pointer-events-none"
                  transform={`translate(${geometry.x}, ${geometry.y - geometry.height / 2 + 2.2})`}
                >
                  <rect
                    x={-Math.max(4.2, label.length * 0.48)}
                    y={-1.45}
                    width={Math.max(8.4, label.length * 0.96)}
                    height={2.9}
                    rx={0.7}
                    fill={viewMode === 'operativo' ? 'rgba(255,253,248,0.88)' : 'rgba(255,253,248,0.84)'}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="1.2"
                    fontWeight="600"
                    fill="var(--brand-ink)"
                  >
                    {label}
                  </text>
                </g>
                {editing && isEditingThis
                  ? (
                    [
                      { corner: 'nw' as const, x: geometry.x - geometry.width / 2, y: geometry.y - geometry.height / 2 },
                      { corner: 'ne' as const, x: geometry.x + geometry.width / 2, y: geometry.y - geometry.height / 2 },
                      { corner: 'se' as const, x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 },
                      { corner: 'sw' as const, x: geometry.x - geometry.width / 2, y: geometry.y + geometry.height / 2 }
                    ].map((handle) => {
                      const isActiveHandle =
                        activeRectHandle?.zonaId === zona.id && activeRectHandle.corner === handle.corner

                      return (
                        <circle
                          key={`${zona.id}-rect-handle-${handle.corner}`}
                          cx={handle.x}
                          cy={handle.y}
                          r={isActiveHandle ? 1.08 : 0.86}
                          fill={isActiveHandle ? 'var(--brand-wine)' : 'rgba(255,253,248,0.98)'}
                          stroke={isActiveHandle ? 'var(--brand-wine)' : visual.rectStroke}
                          strokeWidth={0.28}
                          className="cursor-nwse-resize"
                          onPointerDown={(event) => {
                            event.stopPropagation()
                            onRectHandlePointerDown(zona.id, handle.corner)
                          }}
                        />
                      )
                    })
                  )
                  : null}
              </>
            ) : null}
            {zona.geometry_tipo === 'polygon' ? (
              <>
                <polygon
                  points={polygonPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill={visual.rectFill}
                  stroke={visual.rectStroke}
                  strokeWidth={isSelected ? 0.35 : 0.22}
                  className="cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation()
                    onZonaClick(zona.id, isEditingThis)
                  }}
                />
                <g
                  className="pointer-events-none"
                  transform={`translate(${geometry.x}, ${geometry.y - geometry.height / 2 + 2.2})`}
                >
                  <rect
                    x={-Math.max(4.2, label.length * 0.48)}
                    y={-1.45}
                    width={Math.max(8.4, label.length * 0.96)}
                    height={2.9}
                    rx={0.7}
                    fill={viewMode === 'operativo' ? 'rgba(255,253,248,0.88)' : 'rgba(255,253,248,0.84)'}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="1.2"
                    fontWeight="600"
                    fill="var(--brand-ink)"
                  >
                    {label}
                  </text>
                </g>
                {editing && isEditingThis
                  ? polygonPoints.map((point, pointIndex) => {
                      const isActiveVertex =
                        activePolygonVertex?.zonaId === zona.id && activePolygonVertex.pointIndex === pointIndex

                      return (
                        <circle
                          key={`${zona.id}-vertex-${pointIndex}`}
                          cx={point.x}
                          cy={point.y}
                          r={isActiveVertex ? 1.12 : 0.9}
                          fill={isActiveVertex ? 'var(--brand-wine)' : 'rgba(255,253,248,0.98)'}
                          stroke={isActiveVertex ? 'var(--brand-wine)' : visual.rectStroke}
                          strokeWidth={0.28}
                          className="cursor-grab"
                          onPointerDown={(event) => {
                            event.stopPropagation()
                            onPolygonVertexPointerDown(zona.id, pointIndex)
                          }}
                        />
                      )
                    })
                  : null}
              </>
            ) : null}

            <g transform={`translate(${geometry.x}, ${geometry.y})`}>
              {!showAreaShape || editing ? (
                <>
                  <circle
                    r={editing ? 1.15 : isSelected ? 1.35 : 0.95}
                    fill={visual.pointFill}
                    stroke={visual.pointStroke}
                    strokeWidth={editing ? 0.28 : 0.24}
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.stopPropagation()
                      onZonaClick(zona.id, isEditingThis)
                    }}
                  />
                  {!editing ? (
                    <text
                      x={0}
                      y={-2.1}
                      textAnchor="middle"
                      fontSize="1.08"
                      fontWeight="600"
                      fill={visual.pointStroke}
                      className="pointer-events-none"
                    >
                      {label}
                    </text>
                  ) : null}
                </>
              ) : null}

              {editing ? (
                <circle
                  r={1.8}
                  fill="transparent"
                  className="cursor-grab"
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onDragHandlePointerDown(zona.id)
                  }}
                />
              ) : null}

              {(totalIncidenciasZona || totalLimpiezasZona || totalPreventivosZona) && !editing ? (
                <g className="pointer-events-none" transform="translate(1.8,-1.8)">
                  {totalUrgentesZona ? (
                    <>
                      <rect x={0} y={0} width={2.5} height={1.55} rx={0.45} fill="#be123c" />
                      <text x={1.25} y={1.04} textAnchor="middle" fontSize="0.88" fontWeight="700" fill="white">
                        U{totalUrgentesZona}
                      </text>
                    </>
                  ) : null}
                  {totalIncidenciasZona && !totalUrgentesZona ? (
                    <>
                      <rect x={0} y={0} width={2.5} height={1.55} rx={0.45} fill="#e11d48" />
                      <text x={1.25} y={1.04} textAnchor="middle" fontSize="0.88" fontWeight="700" fill="white">
                        I{totalIncidenciasZona}
                      </text>
                    </>
                  ) : null}
                  {totalLimpiezasZona ? (
                    <>
                      <rect x={(totalIncidenciasZona || totalUrgentesZona) ? 2.9 : 0} y={0} width={2.5} height={1.55} rx={0.45} fill="#0f766e" />
                      <text x={((totalIncidenciasZona || totalUrgentesZona) ? 2.9 : 0) + 1.25} y={1.04} textAnchor="middle" fontSize="0.88" fontWeight="700" fill="white">
                        L{totalLimpiezasZona}
                      </text>
                    </>
                  ) : null}
                  {totalPreventivosZona ? (
                    <>
                      <rect
                        x={totalUrgentesZona || totalIncidenciasZona ? (totalLimpiezasZona ? 5.8 : 2.9) : totalLimpiezasZona ? 2.9 : 0}
                        y={0}
                        width={2.5}
                        height={1.55}
                        rx={0.45}
                        fill="#d97706"
                      />
                      <text
                        x={
                          (totalUrgentesZona || totalIncidenciasZona ? (totalLimpiezasZona ? 5.8 : 2.9) : totalLimpiezasZona ? 2.9 : 0) + 1.25
                        }
                        y={1.04}
                        textAnchor="middle"
                        fontSize="0.88"
                        fontWeight="700"
                        fill="white"
                      >
                        P{totalPreventivosZona}
                      </text>
                    </>
                  ) : null}
                </g>
              ) : null}
            </g>
          </g>
        )
      })}
    </svg>
  )
}

function getZonaVisual({
  isSelected,
  tone,
  hasUrgentes,
  isSubzona,
  viewMode
}: {
  isSelected: boolean
  tone: ZonaStatusTone
  hasUrgentes: boolean
  isSubzona: boolean
  viewMode: 'operativo' | 'arquitectonico'
}) {
  if (isSelected) {
    return {
      rectFill: 'rgba(155,30,33,0.18)',
      rectStroke: 'var(--brand-wine)',
      pointFill: 'var(--brand-wine)',
      pointStroke: 'var(--brand-wine)'
    }
  }

  if (tone === 'critical' && hasUrgentes) {
    return {
      rectFill: 'rgba(220,38,38,0.16)',
      rectStroke: '#dc2626',
      pointFill: '#dc2626',
      pointStroke: '#991b1b'
    }
  }

  if (tone === 'critical') {
    return {
      rectFill: 'rgba(251,146,60,0.16)',
      rectStroke: '#f97316',
      pointFill: '#f97316',
      pointStroke: '#c2410c'
    }
  }

  if (tone === 'warning') {
    return {
      rectFill: 'rgba(239,169,30,0.18)',
      rectStroke: '#f59e0b',
      pointFill: '#f59e0b',
      pointStroke: '#b45309'
    }
  }

  if (isSubzona) {
    return {
      rectFill: viewMode === 'operativo' ? 'rgba(47,62,30,0.1)' : 'rgba(45,212,191,0.14)',
      rectStroke: viewMode === 'operativo' ? 'rgba(47,62,30,0.42)' : '#2dd4bf',
      pointFill: viewMode === 'operativo' ? '#86efac' : '#2dd4bf',
      pointStroke: viewMode === 'operativo' ? '#2f3e1e' : '#0f766e'
    }
  }

  return {
    rectFill: viewMode === 'operativo' ? 'rgba(255,253,248,0.64)' : 'rgba(239,169,30,0.16)',
    rectStroke: viewMode === 'operativo' ? 'rgba(47,62,30,0.34)' : 'rgba(239,169,30,0.5)',
    pointFill: viewMode === 'operativo' ? '#2f3e1e' : '#f59e0b',
    pointStroke: viewMode === 'operativo' ? '#2f3e1e' : '#b45309'
  }
}

function ResumenCard({
  title,
  value,
  detail,
  href,
  tone
}: {
  title: string
  value: number
  detail: string
  href: string
  tone: 'orange' | 'red' | 'yellow' | 'teal'
}) {
  const toneClass = {
    orange: 'border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] text-[#8f5a00] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]',
    red: 'border-[rgba(155,30,33,0.2)] bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)] dark:border-[rgba(155,30,33,0.24)] dark:bg-[rgba(155,30,33,0.2)] dark:text-[color:var(--brand-bone)]',
    yellow: 'border-[rgba(239,169,30,0.22)] bg-[rgba(255,247,224,0.9)] text-[#8b5e00] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(74,59,24,0.78)] dark:text-[#ffd982]',
    teal: 'border-[rgba(47,62,30,0.18)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(39,54,28,0.9)] dark:text-[rgba(232,239,210,0.96)]'
  }[tone]

  return (
    <Link href={href} className={`rounded-xl border p-4 transition hover:-translate-y-0.5 ${toneClass}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{detail}</p>
    </Link>
  )
}

function LayerToggle({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-[color:var(--brand-olive)] bg-[color:var(--brand-olive)] text-[color:var(--brand-bone)]'
          : 'border-[color:var(--brand-border)] bg-transparent text-[color:var(--brand-muted)]'
      }`}
    >
      {label}
    </button>
  )
}

function MapOperationalHud({
  nivelNombre,
  selectedZona,
  selectedZonaAggregate,
  visibleActivosCount,
  visibleIncidenciasCount,
  visibleLimpiezasCount,
  visibleInfraCount,
  preventivosProximosCount,
  editing,
  viewMode
}: {
  nivelNombre: string
  selectedZona: MapaZona | null
  selectedZonaAggregate: ZonaAggregate | null
  visibleActivosCount: number
  visibleIncidenciasCount: number
  visibleLimpiezasCount: number
  visibleInfraCount: number
  preventivosProximosCount: number
  editing: boolean
  viewMode: 'operativo' | 'arquitectonico'
}) {
  return (
    <>
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[min(30rem,calc(100%-2rem))]">
        <div className="rounded-2xl border border-white/60 bg-[rgba(255,253,248,0.84)] px-4 py-3 shadow-[0_18px_50px_-30px_rgba(26,33,23,0.7)] backdrop-blur-md dark:border-white/10 dark:bg-[rgba(18,23,16,0.82)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[color:color-mix(in_srgb,var(--brand-olive)_12%,white)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-olive)]">
              {nivelNombre}
            </span>
            <span className="rounded-full bg-[color:color-mix(in_srgb,var(--brand-gold)_16%,white)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#936100]">
              {viewMode === 'operativo' ? 'Modo operativo' : 'Modo referencia'}
            </span>
            {editing ? (
              <span className="rounded-full bg-[color:color-mix(in_srgb,var(--brand-wine)_12%,white)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-wine)]">
                Edición activa
              </span>
            ) : null}
          </div>
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--brand-muted)]">
              {selectedZona ? 'Foco actual' : 'Superficie activa'}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--brand-ink)] dark:text-[color:var(--brand-bone)]">
              {selectedZona ? selectedZona.nombre || selectedZona.label : 'Mapa operativo'}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
              {selectedZona
                ? `${selectedZona.tipo === 'subzona' ? 'Subzona' : 'Zona'} · ${selectedZona.area}${selectedZonaAggregate ? ` · ${selectedZonaAggregate.incidencias} incidencias` : ''}`
                : 'Incidencias, limpiezas y zonas principales integradas en una sola vista.'}
            </p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-4 top-4 z-10 hidden max-w-[15rem] lg:block">
        <div className="rounded-2xl border border-white/50 bg-[rgba(255,253,248,0.78)] p-3 shadow-[0_18px_50px_-30px_rgba(26,33,23,0.7)] backdrop-blur-md dark:border-white/10 dark:bg-[rgba(18,23,16,0.8)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--brand-muted)]">Lectura rápida</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <HudStat label="Activos" value={visibleActivosCount} tone="olive" />
            <HudStat label="Incidencias" value={visibleIncidenciasCount} tone="wine" />
            <HudStat label="Limpiezas" value={visibleLimpiezasCount} tone="teal" />
            <HudStat label="Infra" value={visibleInfraCount} tone="gold" />
          </div>
          {selectedZonaAggregate ? (
            <div className="mt-3 rounded-xl border border-[rgba(47,62,30,0.12)] bg-[rgba(255,253,248,0.68)] px-3 py-2 dark:bg-[rgba(22,32,18,0.72)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-muted)]">Zona</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--brand-ink)] dark:text-[color:var(--brand-bone)]">
                {selectedZonaAggregate.urgentes} urgentes · {selectedZonaAggregate.preventivos} preventivos
              </p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-[rgba(47,62,30,0.12)] bg-[rgba(255,253,248,0.68)] px-3 py-2 dark:bg-[rgba(22,32,18,0.72)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-muted)]">Nivel</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--brand-ink)] dark:text-[color:var(--brand-bone)]">
                {preventivosProximosCount} preventivos próximos
              </p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <LegendPill label="Crítica" tone="wine" />
            <LegendPill label="Atención" tone="gold" />
            <LegendPill label="Estable" tone="olive" />
            <LegendPill label="Selección" tone="ink" />
          </div>
        </div>
      </div>
    </>
  )
}

function SchematicLevelCanvas({
  nivelNombre,
  totalZonas,
  totalActivos,
  totalInfraestructura,
  totalIncidencias,
  totalUrgentes
}: {
  nivelNombre: string
  totalZonas: number
  totalActivos: number
  totalInfraestructura: number
  totalIncidencias: number
  totalUrgentes: number
}) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-[linear-gradient(135deg,rgba(255,249,238,0.98),rgba(247,244,235,0.96)_36%,rgba(236,241,230,0.96)_100%)] dark:bg-[linear-gradient(135deg,rgba(21,26,19,0.98),rgba(15,20,14,0.98)_42%,rgba(26,34,24,0.98)_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(239,169,30,0.16),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(155,30,33,0.12),transparent_20%),radial-gradient(circle_at_84%_82%,rgba(47,62,30,0.14),transparent_22%)]" />
      <svg
        viewBox="0 0 160 90"
        className="absolute inset-0 h-full w-full text-[rgba(47,62,30,0.1)] dark:text-[rgba(238,227,202,0.08)]"
        aria-hidden="true"
      >
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.38" />
          </pattern>
          <linearGradient id="laneFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,253,248,0.9)" />
            <stop offset="100%" stopColor="rgba(228,234,219,0.78)" />
          </linearGradient>
          <linearGradient id="serviceFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(155,30,33,0.08)" />
            <stop offset="100%" stopColor="rgba(239,169,30,0.04)" />
          </linearGradient>
        </defs>
        <rect width="160" height="90" fill="url(#grid)" />
        <rect x="10" y="12" width="140" height="66" rx="8" fill="rgba(255,255,255,0.16)" stroke="currentColor" strokeWidth="0.6" />
        <rect x="18" y="18" width="124" height="50" rx="5.5" fill="url(#laneFill)" stroke="rgba(47,62,30,0.12)" strokeWidth="0.35" />
        <rect x="24" y="24" width="54" height="14" rx="4" fill="rgba(47,62,30,0.08)" />
        <rect x="84" y="24" width="48" height="14" rx="4" fill="rgba(239,169,30,0.12)" />
        <rect x="24" y="44" width="34" height="18" rx="4" fill="rgba(155,30,33,0.08)" />
        <rect x="64" y="44" width="32" height="18" rx="4" fill="rgba(47,62,30,0.1)" />
        <rect x="102" y="44" width="30" height="18" rx="4" fill="rgba(15,118,110,0.12)" />
        <rect x="24" y="70" width="108" height="4" rx="2" fill="url(#serviceFill)" />
        <path d="M36 18 V68" stroke="rgba(47,62,30,0.12)" strokeWidth="0.3" strokeDasharray="1.5 1.8" />
        <path d="M80 18 V68" stroke="rgba(47,62,30,0.12)" strokeWidth="0.3" strokeDasharray="1.5 1.8" />
        <path d="M116 18 V68" stroke="rgba(47,62,30,0.12)" strokeWidth="0.3" strokeDasharray="1.5 1.8" />
        <path d="M18 40 H142" stroke="rgba(47,62,30,0.1)" strokeWidth="0.3" strokeDasharray="1.5 2.2" />
        <path d="M18 66 H142" stroke="rgba(47,62,30,0.1)" strokeWidth="0.3" strokeDasharray="1.5 2.2" />
        <text x="28" y="33" fontSize="3.2" fontWeight="700" fill="rgba(47,62,30,0.46)">Operación</text>
        <text x="88" y="33" fontSize="3.2" fontWeight="700" fill="rgba(143,90,0,0.58)">Servicio</text>
        <text x="27" y="55" fontSize="2.8" fontWeight="600" fill="rgba(110,26,30,0.52)">Tickets</text>
        <text x="68" y="55" fontSize="2.8" fontWeight="600" fill="rgba(47,62,30,0.5)">Equipos</text>
        <text x="106" y="55" fontSize="2.8" fontWeight="600" fill="rgba(15,118,110,0.56)">Limpiezas</text>
      </svg>
      <div className="absolute left-4 bottom-4 rounded-2xl border border-[rgba(47,62,30,0.12)] bg-[rgba(255,253,248,0.82)] px-4 py-3 shadow-[0_24px_80px_-42px_rgba(26,33,23,0.7)] backdrop-blur-md dark:border-[rgba(238,227,202,0.12)] dark:bg-[rgba(22,32,18,0.82)]">
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--brand-muted)]">Lámina operativa</p>
        <h2 className="mt-1 text-xl font-semibold text-[color:var(--brand-ink)] dark:text-[color:var(--brand-bone)]">{nivelNombre}</h2>
        <p className="mt-1 max-w-xs text-sm text-[color:var(--brand-muted)]">
          Base simplificada para operar, ubicar zonas y leer alertas sin ruido arquitectónico.
        </p>
      </div>
      <div className="absolute right-4 bottom-4 flex flex-wrap justify-end gap-2">
        <span className="rounded-full border border-[rgba(47,62,30,0.12)] bg-[rgba(255,253,248,0.82)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-olive)] shadow-sm backdrop-blur-md">{totalZonas} zonas</span>
        <span className="rounded-full border border-[rgba(47,62,30,0.12)] bg-[rgba(255,253,248,0.82)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-olive)] shadow-sm backdrop-blur-md">{totalActivos} activos</span>
        <span className="rounded-full border border-[rgba(47,62,30,0.12)] bg-[rgba(255,253,248,0.82)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-olive)] shadow-sm backdrop-blur-md">{totalInfraestructura} infraestructura</span>
        <span className="rounded-full border border-[rgba(155,30,33,0.14)] bg-[rgba(155,30,33,0.1)] px-3 py-1.5 text-xs font-semibold text-[color:var(--brand-wine)] shadow-sm backdrop-blur-md">{totalIncidencias} incidencias</span>
        <span className="rounded-full border border-[rgba(239,169,30,0.18)] bg-[rgba(239,169,30,0.12)] px-3 py-1.5 text-xs font-semibold text-[#936100] shadow-sm backdrop-blur-md">{totalUrgentes} urgentes</span>
      </div>
    </div>
  )
}

function HudStat({
  label,
  value,
  tone
}: {
  label: string
  value: number
  tone: 'olive' | 'wine' | 'teal' | 'gold'
}) {
  const toneClass = {
    olive: 'bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)]',
    wine: 'bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)]',
    teal: 'bg-[rgba(15,118,110,0.1)] text-[#0f766e]',
    gold: 'bg-[rgba(239,169,30,0.12)] text-[#936100]'
  }[tone]

  return (
    <div className={`rounded-xl px-3 py-2 ${toneClass}`}>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
    </div>
  )
}

function LegendPill({
  label,
  tone
}: {
  label: string
  tone: 'olive' | 'wine' | 'gold' | 'ink'
}) {
  const dotClass = {
    olive: 'bg-[color:var(--brand-green)]',
    wine: 'bg-[color:var(--brand-wine)]',
    gold: 'bg-[#f59e0b]',
    ink: 'bg-[color:var(--brand-ink)]'
  }[tone]

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[rgba(255,253,248,0.65)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-muted)] dark:bg-[rgba(18,23,16,0.62)]">
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      {label}
    </span>
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
    red: 'bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)] dark:bg-[rgba(155,30,33,0.2)] dark:text-[color:var(--brand-bone)]',
    yellow: 'bg-[rgba(255,247,224,0.9)] text-[#8b5e00] dark:bg-[rgba(74,59,24,0.78)] dark:text-[#ffd982]',
    teal: 'bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:bg-[rgba(39,54,28,0.9)] dark:text-[rgba(232,239,210,0.96)]'
  }[tone]

  return (
    <div className={`rounded-md px-3 py-2 ${toneClass}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] font-medium">{label}</p>
    </div>
  )
}

function IncidenciaLink({ incidencia }: { incidencia: MapaIncidencia }) {
  return (
    <Link
      href={`/incidencias/${incidencia.id}`}
      className="block rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] p-2 text-sm text-[color:var(--brand-wine)] hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)]"
    >
      <span className="font-medium">{incidencia.ticket_numero} · {incidencia.descripcion}</span>
      <span className="mt-1 block text-xs text-[color:var(--brand-wine)]">
        {incidencia.zona_nombre ?? 'Sin ubicación'}
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
