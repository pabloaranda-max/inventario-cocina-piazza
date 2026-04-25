'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { crearLimpiezaMapa, guardarMapaZonas } from './actions'
import { crearActivoRapido } from '../incidencias/actions'
import { equipoAreas } from '@/lib/defined-options'
import type {
  MapaNivel,
  MapaZona,
  MapaActivo,
  MapaIncidencia,
  MapaInfraestructura,
  MapaLimpieza,
  MapaPendiente,
  ZonaAggregate,
  ZonaStatusTone,
  PanelView
} from '@/lib/types'
import {
  UnifiedOperationPanel,
  PanelViewButton,
  HudStat,
  mutedButtonClass,
  wineButtonClass,
  oliveButtonClass,
  goldButtonClass
} from './panel-operativo'
import { initialFormState } from '@/lib/form-state'
import { FormError } from '@/components/ui/flash-message'
import { formatDate, todayMX, daysFromNowMX } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

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
  nombre: string
  tipo: MapaZona['tipo']
  geometryTipo: MapaZona['geometry_tipo']
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

const defaultNuevaZonaDraft: NuevaZonaDraft = {
  nombre: '',
  tipo: 'zona',
  geometryTipo: 'rect'
}

function getZonaLegacyArea(zona: Pick<MapaZona, 'area' | 'nombre' | 'label'> | null | undefined) {
  if (!zona) return null
  return zona.area?.trim() || zona.nombre?.trim() || zona.label?.trim() || null
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

function getPointerHudAnchor(point: ZonaPoint | null) {
  if (!point) return null

  const placeLeft = point.x > 72
  const placeAbove = point.y > 70

  return {
    left: Math.min(86, Math.max(14, Number((placeLeft ? point.x - 4 : point.x + 4).toFixed(3)))),
    top: Math.min(84, Math.max(14, Number((placeAbove ? point.y - 4 : point.y + 4).toFixed(3)))),
    translateX: placeLeft ? '-100%' : '0%',
    translateY: placeAbove ? '-100%' : '0%'
  }
}

function getNivelShortLabel(name: string) {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'planta baja' || normalized.includes('planta baja')) return 'PB'
  if (normalized.includes('primer')) return '1N'
  if (normalized.includes('segundo')) return '2N'
  if (normalized.includes('paliller')) return 'PAL'
  if (normalized.includes('techo') || normalized.includes('azotea')) return 'TCH'
  return name.trim().slice(0, 3).toUpperCase()
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

function insertPolygonPointAfterIndex(points: ZonaPoint[], insertAfterIndex: number): ZonaPoint[] {
  if (points.length < 2) return points

  const safeIndex = ((insertAfterIndex % points.length) + points.length) % points.length
  const currentPoint = points[safeIndex]
  const nextPoint = points[(safeIndex + 1) % points.length]

  return [
    ...points.slice(0, safeIndex + 1),
    {
      x: Number((((currentPoint.x + nextPoint.x) / 2)).toFixed(3)),
      y: Number((((currentPoint.y + nextPoint.y) / 2)).toFixed(3))
    },
    ...points.slice(safeIndex + 1)
  ]
}

export function MapaOperativo({
  activos,
  incidencias,
  niveles,
  zonas,
  infraestructura,
  limpiezas,
  pendientes
}: {
  activos: MapaActivo[]
  incidencias: MapaIncidencia[]
  niveles: MapaNivel[]
  zonas: MapaZona[]
  infraestructura: MapaInfraestructura[]
  limpiezas: MapaLimpieza[]
  pendientes: MapaPendiente[]
}) {
  const router = useRouter()
  const defaultNivelId =
    niveles.find((nivel) => nivel.nombre?.trim().toLowerCase() === 'planta baja')?.id ??
    niveles.find((nivel) => nivel.nombre?.trim().toLowerCase().includes('planta baja'))?.id ??
    niveles[0]?.id ??
    ''
  const [selectedNivelId, setSelectedNivelId] = useState(defaultNivelId)
  const [selectedZonaId, setSelectedZonaId] = useState<string | null>(null)
  const [hoveredZonaId, setHoveredZonaId] = useState<string | null>(null)
  const [hoveredZonaPoint, setHoveredZonaPoint] = useState<ZonaPoint | null>(null)
  const [selectedActivoId, setSelectedActivoId] = useState<string | null>(null)
  const [selectedInfraestructuraId, setSelectedInfraestructuraId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1.1)
  const [editing, setEditing] = useState(false)
  const [showMapFilters, setShowMapFilters] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [panelView, setPanelView] = useState<PanelView>('summary')
  const viewMode: 'arquitectonico' = 'arquitectonico'
  const [showZonas, setShowZonas] = useState(true)
  const [showActivos, setShowActivos] = useState(true)
  const [showInfraestructura, setShowInfraestructura] = useState(true)
  const [editableZonas, setEditableZonas] = useState(zonas)
  const [deletedZonaIds, setDeletedZonaIds] = useState<string[]>([])
  const [editingZonaId, setEditingZonaId] = useState<string | null>(null)
  const [newZonaDraft, setNewZonaDraft] = useState<NuevaZonaDraft>(defaultNuevaZonaDraft)
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null)
  const [state, formAction] = useActionState(guardarMapaZonas, initialFormState)

  useEffect(() => {
    if (state.success) {
      setEditing(false)
      setEditingZonaId(null)
      setDeletedZonaIds([])
      setSaveConfirmation('Mapa guardado. Saliste del modo edición.')
      router.refresh()
    }
  }, [state.success, router])

  useEffect(() => {
    if (!saveConfirmation) return

    const timeoutId = window.setTimeout(() => {
      setSaveConfirmation(null)
    }, 2800)

    return () => window.clearTimeout(timeoutId)
  }, [saveConfirmation])

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
  const today = todayMX()
  const weekAhead = daysFromNowMX(7)
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
  const activosPorId = useMemo(
    () => activos.reduce<Record<string, MapaActivo>>((acc, activo) => ({ ...acc, [activo.id]: activo }), {}),
    [activos]
  )
  const infraestructuraPorId = useMemo(
    () => infraestructura.reduce<Record<string, MapaInfraestructura>>((acc, item) => ({ ...acc, [item.id]: item }), {}),
    [infraestructura]
  )

  const activosNivelBase = useMemo(
    () => activos.filter((activo) => activo.nivel_id === selectedNivel?.id),
    [activos, selectedNivel?.id]
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
  const hoveredZona = hoveredZonaId
    ? editableZonas.find((zona) => zona.id === hoveredZonaId) ?? zonas.find((zona) => zona.id === hoveredZonaId) ?? null
    : null
  const editingZona = editingZonaId
    ? editableZonas.find((zona) => zona.id === editingZonaId) ?? null
    : null

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

  const visibleActivos = useMemo(() => {
    if (!selectedZonaIds) return activosNivelBase
    return activosNivelBase.filter((activo) => !!activo.zona_id && selectedZonaIds.has(activo.zona_id))
  }, [activosNivelBase, selectedZonaIds])

  const visibleInfraestructura = useMemo(() => {
    if (!selectedZonaIds) return infraestructuraNivelBase
    return infraestructuraNivelBase.filter((item) => !!item.zona_id && selectedZonaIds.has(item.zona_id))
  }, [infraestructuraNivelBase, selectedZonaIds])

  const visibleLimpiezas = useMemo(() => {
    if (!selectedZonaIds) return limpiezasNivel.filter((limpieza) => limpieza.activo_id || limpieza.zona_id)

    return limpiezasNivel.filter((limpieza) => {
      if (limpieza.zona_id && selectedZonaIds.has(limpieza.zona_id)) return true

      const activo = limpieza.activo_id ? activosPorId[limpieza.activo_id] ?? null : null
      if (activo?.zona_id) return selectedZonaIds.has(activo.zona_id)

      return false
    })
  }, [activosPorId, limpiezasNivel, selectedZonaIds])

  const visibleIncidencias = useMemo(() => {
    if (!selectedZonaIds) {
      return incidenciasNivel.filter(
        (incidencia) => incidencia.activo_id || incidencia.equipo_id || incidencia.infraestructura_id || incidencia.zona_id
      )
    }

    return incidenciasNivel.filter((incidencia) => {
      if (incidencia.zona_id && selectedZonaIds.has(incidencia.zona_id)) return true

      const activo = incidencia.activo_id ? activosPorId[incidencia.activo_id] ?? null : null
      if (activo?.zona_id) return selectedZonaIds.has(activo.zona_id)

      const item = incidencia.infraestructura_id ? infraestructuraPorId[incidencia.infraestructura_id] ?? null : null
      if (item?.zona_id) return selectedZonaIds.has(item.zona_id)

      return false
    })
  }, [activosPorId, incidenciasNivel, infraestructuraPorId, selectedZonaIds])

  const selectedInfraestructura = selectedInfraestructuraId
    ? infraestructura.find((item) => item.id === selectedInfraestructuraId) ?? null
    : null
  const selectedActivo = selectedActivoId
    ? activos.find((activo) => activo.id === selectedActivoId) ?? null
    : null

  useEffect(() => {
    if (editing) {
      setPanelView('editing')
      return
    }

    if (selectedActivo || selectedInfraestructura) {
      setPanelView('assets')
    }
  }, [editing, selectedActivo, selectedInfraestructura])

  const zoomPercent = Math.round(zoom * 100)
  const urgentes = useMemo(
    () => incidenciasNivel.filter((incidencia) => incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente'),
    [incidenciasNivel]
  )
  const atorados = useMemo(
    () =>
      incidenciasNivel.filter((incidencia) => {
        if (incidencia.estado !== 'en_progreso') return false
        const referenceTime = incidencia.updated_at || incidencia.fecha_reporte
        const ageMs = Date.now() - new Date(referenceTime).getTime()
        return Number.isFinite(ageMs) && ageMs >= 48 * 60 * 60 * 1000
      }),
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

    const collectZonaTargets = (zonaId?: string | null) => {
      const ids = new Set<string>()

      if (zonaId && accumulators[zonaId]) {
        ids.add(zonaId)
        ;(zonaAncestorsById[zonaId] ?? []).forEach((ancestorId) => {
          if (accumulators[ancestorId]) ids.add(ancestorId)
        })
      }

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
      const targets = collectZonaTargets(activo.zona_id)
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
      const targets = collectZonaTargets(item.zona_id)
      const hasPreventivoVencido = item.fecha_proxima_revision && item.fecha_proxima_revision < today
      const hasPreventivoProximo = getDueSoon(item.fecha_proxima_revision, today, weekAhead)

      if (hasPreventivoVencido || hasPreventivoProximo) {
        registerOnTargets(targets, 'preventivos', item.id)
      }
    })

    incidenciasNivel.forEach((incidencia) => {
      const activo = incidencia.activo_id ? activosPorId[incidencia.activo_id] ?? null : null
      const item = incidencia.infraestructura_id ? infraestructuraPorId[incidencia.infraestructura_id] ?? null : null
      const targets = collectZonaTargets(incidencia.zona_id ?? activo?.zona_id ?? item?.zona_id ?? null)
      registerOnTargets(targets, 'incidencias', incidencia.id)

      if (incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente') {
        registerOnTargets(targets, 'urgentes', incidencia.id)
      }
    })

    limpiezasNivel.forEach((limpieza) => {
      const activo = limpieza.activo_id ? activosPorId[limpieza.activo_id] ?? null : null
      const targets = collectZonaTargets(limpieza.zona_id ?? activo?.zona_id ?? null)
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
      urgentes,
      pendientes,
      atorados,
      revisionesVencidas: revisionesVencidasCount,
      preventivosProximos: preventivosProximosCount,
      limpiezasAtrasadas: limpiezasAtrasadasCount
    }),
    [
      activosNivelBase.length,
      atorados,
      incidenciasNivel.length,
      infraestructuraNivelBase.length,
      limpiezasAtrasadasCount,
      pendientes,
      preventivosProximosCount,
      revisionesVencidasCount,
      urgentes,
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

  const insertPolygonVertexAtEdge = useCallback((id: string, insertAfterIndex: number) => {
    let insertedIndex: number | null = null

    setEditableZonas((current) =>
      current.map((zona) => {
        if (zona.id !== id || zona.geometry_tipo !== 'polygon') return zona

        const nextPoints = insertPolygonPointAfterIndex(getZonaPolygonPoints(zona), insertAfterIndex)
        const geometry = getPolygonMetrics(nextPoints)
        insertedIndex = Math.min(insertAfterIndex + 1, nextPoints.length - 1)

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

    if (insertedIndex !== null) {
      setActivePolygonVertex({ zonaId: id, pointIndex: insertedIndex })
    }
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
    const area = nombre
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
    <div
      className={`grid gap-3 lg:min-h-[calc(100dvh-7.5rem)] ${
        rightPanelCollapsed
          ? 'lg:grid-cols-[minmax(0,1fr)_32px]'
          : 'lg:grid-cols-[minmax(0,1fr)_320px]'
      }`}
    >
      <section className="overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[linear-gradient(180deg,rgba(18,23,18,0.98),rgba(18,23,18,0.98)_15%,rgba(255,253,248,0.98)_15.2%,rgba(244,245,240,0.96)_100%)] shadow-[0_24px_80px_-48px_rgba(47,62,30,0.55)] dark:bg-[linear-gradient(180deg,rgba(12,16,12,0.98),rgba(12,16,12,0.98)_15%,rgba(14,18,13,0.98)_100%)]">
        <div className="overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[linear-gradient(180deg,rgba(18,23,18,0.98),rgba(18,23,18,0.98)_15%,rgba(255,253,248,0.98)_15.2%,rgba(244,245,240,0.96)_100%)] shadow-[0_24px_80px_-48px_rgba(47,62,30,0.55)] dark:bg-[linear-gradient(180deg,rgba(12,16,12,0.98),rgba(12,16,12,0.98)_15%,rgba(14,18,13,0.98)_100%)]">
          <div className="max-h-[calc(100dvh-8.5rem)] min-h-[82vh] overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(239,169,30,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(155,30,33,0.1),transparent_32%)]">
            <div
              ref={mapRef}
              className="relative min-w-full"
              style={{ width: `${zoom * 100}%` }}
              onClick={() => editing && setEditingZonaId(null)}
            >
              {selectedNivel ? (
                <Image
                  src={selectedNivel.imagen_url}
                  alt={selectedNivel.nombre}
                  width={1366}
                  height={768}
                  className="block w-full select-none"
                  priority
                />
              ) : (
                <div className="flex h-96 items-center justify-center bg-[color:color-mix(in_srgb,var(--brand-bone)_86%,white)] text-sm text-[color:var(--brand-muted)]">
                  Sin láminas cargadas.
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex items-start justify-between px-3">
                <FloatingLevelSelector
                  niveles={niveles}
                  selectedNivelId={selectedNivel?.id ?? ''}
                  onSelectNivel={(nivelId) => {
                    setSelectedNivelId(nivelId)
                    setSelectedZonaId(null)
                    setSelectedActivoId(null)
                    setSelectedInfraestructuraId(null)
                  }}
                />
                <FloatingMapControls
                  zoomPercent={zoomPercent}
                  zoom={zoom}
                  showZonas={showZonas}
                  showActivos={showActivos}
                  showInfraestructura={showInfraestructura}
                  showMapFilters={showMapFilters}
                  onToggleFilters={() => setShowMapFilters((value) => !value)}
                  onToggleZonas={() => setShowZonas((value) => !value)}
                  onToggleActivos={() => setShowActivos((value) => !value)}
                  onToggleInfra={() => setShowInfraestructura((value) => !value)}
                  onZoomOut={() => updateZoom(zoom - 0.25)}
                  onZoomReset={() => updateZoom(1)}
                  onZoomIn={() => updateZoom(zoom + 0.25)}
                />
              </div>
              {!selectedZona && hoveredZona ? (
                <MapHoverHud
                  zona={hoveredZona}
                  aggregate={zonaAggregatesById[hoveredZona.id] ?? null}
                  anchor={hoveredZonaPoint}
                />
              ) : null}
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
                  onZonaHover={(zonaId, point) => {
                    if (editing && viewMode === 'arquitectonico') return
                    setHoveredZonaId(zonaId)
                    setHoveredZonaPoint(point)
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
                    setSelectedZonaId(zonaId)
                    setActivePolygonVertex({ zonaId, pointIndex })
                  }}
                  onPolygonEdgePointerDown={(zonaId, insertAfterIndex) => {
                    if (!editing) return
                    setEditingZonaId(zonaId)
                    setSelectedZonaId(zonaId)
                    insertPolygonVertexAtEdge(zonaId, insertAfterIndex)
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

        {saveConfirmation ? (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
            <div className="rounded-full border border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] bg-[rgba(19,28,18,0.92)] px-4 py-2 text-sm font-medium text-[color:var(--brand-bone)] shadow-[0_20px_50px_-28px_rgba(0,0,0,0.55)]">
              {saveConfirmation}
            </div>
          </div>
        ) : null}

      </section>

      <aside className={`${rightPanelCollapsed ? 'flex items-start justify-center bg-transparent p-0 shadow-none border-0 overflow-visible' : 'overflow-auto rounded-[30px] border border-[rgba(47,62,30,0.16)] bg-[linear-gradient(180deg,rgba(255,255,252,0.99),rgba(239,241,234,0.99))] p-4 shadow-[0_24px_80px_-52px_rgba(47,62,30,0.6)] dark:bg-[linear-gradient(180deg,rgba(18,24,17,0.98),rgba(13,18,13,0.98))] lg:max-h-[calc(100dvh-7.5rem)]'}`}>
          <div className={`mb-4 rounded-[22px] border border-[rgba(47,62,30,0.14)] bg-[linear-gradient(145deg,rgba(255,255,252,0.98),rgba(244,240,228,0.98))] px-4 py-4 dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(28,35,25,0.94),rgba(20,27,18,0.98))] ${rightPanelCollapsed ? 'mb-0 border-0 bg-transparent p-0 dark:bg-transparent' : ''}`}>
            {rightPanelCollapsed ? (
              <button
                type="button"
                onClick={() => setRightPanelCollapsed(false)}
                className="mt-4 rounded-full border border-[rgba(47,62,30,0.14)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-muted)] shadow-[0_12px_30px_-18px_rgba(0,0,0,0.45)] dark:border-white/10 dark:bg-[rgba(18,24,17,0.82)]"
                aria-label="Abrir centro de operación"
              >
                Panel
              </button>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--brand-muted)]">Centro de operación</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--brand-ink)]">
                      {panelView === 'editing'
                        ? 'Edición'
                        : panelView === 'assets'
                          ? selectedActivo
                            ? selectedActivo.nombre
                            : selectedInfraestructura
                              ? selectedInfraestructura.nombre
                              : 'Activos e infraestructura'
                          : panelView === 'incidents'
                            ? 'Incidencias'
                            : panelView === 'cleaning'
                              ? 'Limpiezas'
                              : selectedZona
                                ? selectedZona.nombre || selectedZona.label
                                : selectedNivel?.nombre ?? 'Resumen'}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--brand-muted)]">
                      {panelView === 'editing'
                        ? 'La edición y guardado viven aquí mientras ajustas el mapa.'
                        : 'Panel único para resumen, navegación operativa y acciones del mapa.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRightPanelCollapsed(true)}
                    className="rounded-full border border-[rgba(47,62,30,0.14)] bg-[rgba(255,255,255,0.72)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-muted)]"
                    aria-label="Colapsar centro de operación"
                  >
                    —
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!editing ? (
                    <>
                      <PanelViewButton active={panelView === 'summary'} label="Resumen" onClick={() => setPanelView('summary')} />
                      <PanelViewButton active={panelView === 'assets'} label="Activos" onClick={() => setPanelView('assets')} />
                      <PanelViewButton active={panelView === 'incidents'} label="Incidencias" onClick={() => setPanelView('incidents')} />
                      <PanelViewButton active={panelView === 'cleaning'} label="Limpiezas" onClick={() => setPanelView('cleaning')} />
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEditing((value) => !value)}
                    className={editing ? wineButtonClass : oliveButtonClass}
                  >
                    {editing ? 'Salir de edición' : 'Editar zonas'}
                  </button>
                  {selectedZona ? (
                    <button type="button" onClick={() => setSelectedZonaId(null)} className={mutedButtonClass}>
                      Limpiar selección
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
          {rightPanelCollapsed ? null : editing ? (
            <details open className="rounded-[24px] border border-[rgba(15,23,12,0.08)] bg-[color:color-mix(in_srgb,var(--brand-bone)_84%,white)] p-4 dark:bg-[rgba(19,25,17,0.94)]">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[color:var(--brand-ink)]">
              Edición y guardado del mapa
            </summary>
            <form action={formAction} className="mt-4 space-y-4">
              <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[linear-gradient(180deg,rgba(255,253,248,0.76),rgba(244,245,240,0.9))] p-4 dark:bg-[linear-gradient(180deg,rgba(31,39,29,0.92),rgba(20,27,18,0.96))]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-muted)]">Paso 1</p>
                    <h3 className="mt-1 text-sm font-semibold text-[color:var(--brand-ink)]">Plantilla de zona</h3>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--brand-muted)]">
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
              <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] p-4 dark:bg-[rgba(19,25,17,0.94)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-muted)]">Paso 2</p>
                    <h3 className="mt-1 text-sm font-semibold text-[color:var(--brand-ink)]">Zonas del nivel</h3>
                    <p className="mt-1 text-xs leading-5 text-[color:var(--brand-muted)]">
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
                        className={`w-full rounded-[18px] border px-3 py-2.5 text-left transition ${
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
                              {zona.tipo === 'subzona' ? 'Subzona' : 'Zona'} · {zona.geometry_tipo}
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
                <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] p-4 dark:bg-[rgba(19,25,17,0.94)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-muted)]">Paso 3</p>
                      <h3 className="mt-1 text-sm font-semibold text-[color:var(--brand-ink)]">Zona seleccionada</h3>
                      <p className="mt-1 text-xs leading-5 text-[color:var(--brand-muted)]">
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
                        onChange={(e) => updateZona(editingZona.id, {
                          nombre: e.target.value,
                          label: e.target.value,
                          area: e.target.value
                        })}
                      />
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
                          <span className="brand-hint mt-1 block">Arrastra los vértices o toca un punto intermedio del contorno para insertar otro. También puedes editar una coordenada por línea: `x, y`.</span>
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
                <section className="rounded-[24px] border border-dashed border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[rgba(255,253,248,0.66)] p-4 text-sm leading-6 text-[color:var(--brand-muted)] dark:bg-[rgba(19,25,17,0.9)]">
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
            </details>
          ) : (
            <UnifiedOperationPanel
              view={panelView === 'editing' ? 'summary' : panelView}
              resumenNivel={resumenNivel}
              activos={visibleActivos}
              infraestructura={visibleInfraestructura}
              incidencias={visibleIncidencias}
              limpiezas={visibleLimpiezas}
              incidenciasSinUbicacion={selectedZona ? [] : incidenciasSinUbicacion}
              limpiezasSinUbicacion={selectedZona ? [] : limpiezasSinUbicacion}
              selectedZona={selectedZona}
              selectedZonaAggregate={selectedZonaAggregate}
              selectedActivo={selectedActivo}
              selectedInfraestructura={selectedInfraestructura}
              incidenciasPorActivo={incidenciasPorActivo}
              limpiezasPorActivo={limpiezasPorActivo}
            />
          )}
        </aside>
    </div>
  )
}


function FloatingLevelSelector({
  niveles,
  selectedNivelId,
  onSelectNivel
}: {
  niveles: MapaNivel[]
  selectedNivelId: string
  onSelectNivel: (nivelId: string) => void
}) {
  const orderedNiveles = [...niveles].reverse()

  return (
    <div
      className="pointer-events-auto rounded-[16px] border border-white/10 bg-[rgba(18,23,18,0.62)] px-2 py-2 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.72)] backdrop-blur-md"
      title="Selector de niveles"
      aria-label="Selector de niveles"
    >
      <div className="flex min-w-[3.5rem] flex-col items-center justify-end gap-1">
        {orderedNiveles.map((nivel, index) => {
            const selected = nivel.id === selectedNivelId
            const widthClass =
              index === 0 ? 'w-8' : index === 1 ? 'w-10' : index === 2 ? 'w-12' : index === 3 ? 'w-14' : 'w-16'

            return (
              <button
                key={nivel.id}
                type="button"
                onClick={() => onSelectNivel(nivel.id)}
                aria-label={`Ir a ${nivel.nombre}`}
                title={nivel.nombre}
                className={`${widthClass} flex h-6 items-center justify-center rounded-md border text-[9px] font-semibold uppercase tracking-[0.12em] transition ${
                  selected
                    ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)] shadow-[0_10px_24px_-14px_rgba(155,30,33,0.7)]'
                    : 'border-white/10 bg-[rgba(255,255,255,0.08)] text-[rgba(238,227,202,0.9)] hover:border-[rgba(238,227,202,0.24)] hover:bg-[rgba(255,255,255,0.12)]'
                }`}
              >
                {getNivelShortLabel(nivel.nombre)}
              </button>
            )
        })}
      </div>
    </div>
  )
}

function FloatingMapControls({
  zoomPercent,
  zoom,
  showZonas,
  showActivos,
  showInfraestructura,
  showMapFilters,
  onToggleFilters,
  onToggleZonas,
  onToggleActivos,
  onToggleInfra,
  onZoomOut,
  onZoomReset,
  onZoomIn
}: {
  zoomPercent: number
  zoom: number
  showZonas: boolean
  showActivos: boolean
  showInfraestructura: boolean
  showMapFilters: boolean
  onToggleFilters: () => void
  onToggleZonas: () => void
  onToggleActivos: () => void
  onToggleInfra: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomIn: () => void
}) {
  return (
    <div className="pointer-events-auto flex items-start gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={onToggleFilters}
          className="rounded-full border border-white/10 bg-[rgba(18,23,18,0.68)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(238,227,202,0.9)] shadow-[0_20px_45px_-28px_rgba(0,0,0,0.72)] backdrop-blur-md"
        >
          Capas
        </button>
        {showMapFilters ? (
          <div className="absolute right-0 mt-2 w-44 rounded-[18px] border border-white/10 bg-[rgba(18,23,18,0.88)] p-3 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <div className="space-y-2">
              <LayerToggle label="Zonas" active={showZonas} onClick={onToggleZonas} />
              <LayerToggle label="Activos" active={showActivos} onClick={onToggleActivos} />
              <LayerToggle label="Infra" active={showInfraestructura} onClick={onToggleInfra} />
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[rgba(18,23,18,0.68)] px-1.5 py-1.5 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.72)] backdrop-blur-md">
        <button
          type="button"
          onClick={onZoomOut}
          className={`${mutedButtonClass} min-w-8 px-2 py-1.5 disabled:opacity-40`}
          disabled={zoom <= 1}
          aria-label="Alejar"
        >
          -
        </button>
        <button
          type="button"
          onClick={onZoomReset}
          className={`${mutedButtonClass} min-w-[4.25rem] px-2 py-1.5 text-[11px] font-semibold`}
          aria-label="Restablecer zoom"
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          className={`${mutedButtonClass} min-w-8 px-2 py-1.5 disabled:opacity-40`}
          disabled={zoom >= 2.5}
          aria-label="Acercar"
        >
          +
        </button>
      </div>
    </div>
  )
}

function MapaZonasOverlay({
  zonas,
  editing,
  viewMode,
  activePolygonVertex,
  activeRectHandle,
  onZonaClick,
  onZonaHover,
  onDragHandlePointerDown,
  onPolygonVertexPointerDown,
  onPolygonEdgePointerDown,
  onRectHandlePointerDown
}: {
  zonas: ZonaRenderData[]
  editing: boolean
  viewMode: 'operativo' | 'arquitectonico'
  activePolygonVertex: { zonaId: string; pointIndex: number } | null
  activeRectHandle: { zonaId: string; corner: RectHandleCorner } | null
  onZonaClick: (zonaId: string, isEditingThis: boolean) => void
  onZonaHover: (zonaId: string | null, point: ZonaPoint | null) => void
  onDragHandlePointerDown: (zonaId: string) => void
  onPolygonVertexPointerDown: (zonaId: string, pointIndex: number) => void
  onPolygonEdgePointerDown: (zonaId: string, insertAfterIndex: number) => void
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
          <g
            key={zona.id}
            onMouseEnter={(event) => {
              const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
              if (!svgRect) return onZonaHover(zona.id, null)

              onZonaHover(zona.id, {
                x: Number((((event.clientX - svgRect.left) / svgRect.width) * 100).toFixed(3)),
                y: Number((((event.clientY - svgRect.top) / svgRect.height) * 100).toFixed(3))
              })
            }}
            onMouseMove={(event) => {
              const svgRect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
              if (!svgRect) return

              onZonaHover(zona.id, {
                x: Number((((event.clientX - svgRect.left) / svgRect.width) * 100).toFixed(3)),
                y: Number((((event.clientY - svgRect.top) / svgRect.height) * 100).toFixed(3))
              })
            }}
            onMouseLeave={() => onZonaHover(null, null)}
          >
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
                {editing && isEditingThis ? (
                  <polygon
                    points={polygonPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke="rgba(155,30,33,0.42)"
                    strokeWidth={0.9}
                    strokeDasharray="1.6 1.2"
                    className="pointer-events-none"
                  />
                ) : null}
                <polygon
                  points={polygonPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill={visual.rectFill}
                  stroke={visual.rectStroke}
                  strokeWidth={editing && isEditingThis ? 0.46 : isSelected ? 0.35 : 0.22}
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
                    <>
                      {polygonPoints.map((point, pointIndex) => {
                        const nextPoint = polygonPoints[(pointIndex + 1) % polygonPoints.length]
                        const midX = Number((((point.x + nextPoint.x) / 2)).toFixed(3))
                        const midY = Number((((point.y + nextPoint.y) / 2)).toFixed(3))
                        const isActiveVertex =
                          activePolygonVertex?.zonaId === zona.id && activePolygonVertex.pointIndex === pointIndex

                        return (
                          <g key={`${zona.id}-vertex-group-${pointIndex}`}>
                            <circle
                              cx={midX}
                              cy={midY}
                              r={0.7}
                              fill="rgba(255,253,248,0.92)"
                              stroke="rgba(155,30,33,0.5)"
                              strokeWidth={0.24}
                              className="cursor-copy"
                              onPointerDown={(event) => {
                                event.stopPropagation()
                                onPolygonEdgePointerDown(zona.id, pointIndex)
                              }}
                            />
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r={isActiveVertex ? 1.3 : 1.02}
                              fill={isActiveVertex ? 'var(--brand-wine)' : 'rgba(255,253,248,0.98)'}
                              stroke={isActiveVertex ? 'var(--brand-wine)' : visual.rectStroke}
                              strokeWidth={0.32}
                              className="cursor-grab"
                              onPointerDown={(event) => {
                                event.stopPropagation()
                                onPolygonVertexPointerDown(zona.id, pointIndex)
                              }}
                            />
                          </g>
                        )
                      })}
                    </>
                  )
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
    orange: 'border-[rgba(255,255,255,0.1)] bg-[linear-gradient(145deg,rgba(239,169,30,0.22),rgba(255,255,255,0.06))] text-[rgba(255,239,196,0.98)]',
    red: 'border-[rgba(255,255,255,0.1)] bg-[linear-gradient(145deg,rgba(155,30,33,0.26),rgba(255,255,255,0.04))] text-[rgba(255,232,225,0.98)]',
    yellow: 'border-[rgba(255,255,255,0.1)] bg-[linear-gradient(145deg,rgba(239,169,30,0.18),rgba(255,255,255,0.05))] text-[rgba(255,242,209,0.98)]',
    teal: 'border-[rgba(255,255,255,0.1)] bg-[linear-gradient(145deg,rgba(47,62,30,0.34),rgba(255,255,255,0.04))] text-[rgba(232,239,210,0.98)]'
  }[tone]

  return (
    <Link href={href} className={`rounded-[22px] border p-4 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.75)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/12 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{value}</p>
      <p className="mt-2 text-xs leading-5 opacity-75">{detail}</p>
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
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-[rgba(238,227,202,0.16)] bg-[rgba(238,227,202,0.92)] text-[color:var(--brand-ink)]'
          : 'border-white/10 bg-white/8 text-[rgba(238,227,202,0.72)]'
      }`}
    >
      {label}
    </button>
  )
}

function MapHoverHud({
  zona,
  aggregate,
  anchor
}: {
  zona: MapaZona
  aggregate: ZonaAggregate | null
  anchor: ZonaPoint | null
}) {
  const hudAnchor = getPointerHudAnchor(anchor)

  if (!hudAnchor) return null

  return (
    <div
      className="pointer-events-none absolute z-10 hidden w-52 max-w-[14rem] lg:block"
      style={{
        left: `${hudAnchor.left}%`,
        top: `${hudAnchor.top}%`,
        transform: `translate(${hudAnchor.translateX}, ${hudAnchor.translateY})`
      }}
    >
      <div className="rounded-[20px] border border-white/12 bg-[rgba(18,23,18,0.88)] px-3 py-2.5 shadow-[0_18px_50px_-30px_rgba(26,33,23,0.82)] backdrop-blur-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[rgba(238,227,202,0.52)]">
          {zona.tipo === 'subzona' ? 'Subzona' : 'Zona'}
        </p>
        <p className="mt-1 text-sm font-semibold text-[color:var(--brand-bone)]">{zona.nombre || zona.label}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <HudStat label="Incid." value={aggregate?.incidencias ?? 0} tone="wine" />
          <HudStat label="Activos" value={aggregate?.activos ?? 0} tone="olive" />
        </div>
        <p className="mt-2 text-xs text-[rgba(238,227,202,0.68)]">
          {aggregate ? `${aggregate.urgentes} urgentes · ${aggregate.preventivos} preventivos` : 'Sin actividad agregada'}
        </p>
      </div>
    </div>
  )
}
