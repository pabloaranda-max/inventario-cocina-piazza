export type EstadoEquipo =
  | 'operativo'
  | 'en_reparacion'
  | 'fuera_de_servicio'
  | 'pendiente_revision'

export type PrioridadIncidencia = 'baja' | 'media' | 'alta' | 'urgente'
export type EstadoIncidencia = 'pendiente_asignacion' | 'abierta' | 'en_progreso' | 'resuelta' | 'cerrada'
export type TipoMantenimiento = 'preventivo' | 'correctivo' | 'limpieza_profunda'
export type EjecucionMantenimiento = 'interno' | 'externo'
export type EstadoCotizacion = 'pendiente_revision' | 'aprobada' | 'rechazada'
export type EstadoInfraestructura =
  | 'operativo'
  | 'requiere_revision'
  | 'obstruido'
  | 'con_fuga'
  | 'sin_acceso'
  | 'fuera_de_servicio'
export type CriticidadInfraestructura = 'baja' | 'media' | 'alta' | 'critica'
export type ClaseActivo = 'equipo' | 'infraestructura' | 'mobiliario' | 'edificacion' | 'sistema'
export type EstadoActivo =
  | EstadoEquipo
  | EstadoInfraestructura

export type Proveedor = {
  id: string
  nombre: string
  especialidad: string | null
  telefono: string | null
  contacto: string | null
  puesto_contacto: string | null
  telefono_secundario: string | null
  contacto_secundario: string | null
  puesto_contacto_secundario: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export type Activo = {
  id: string
  clase: ClaseActivo
  nombre: string
  tipo: string
  sistema: string | null
  area: string | null
  zona_id: string | null
  estado: EstadoActivo
  criticidad: CriticidadInfraestructura
  proveedor_id: string | null
  nivel_id: string | null
  x: number | null
  y: number | null
  foto_url: string | null
  notas: string | null
  fecha_ultima_revision: string | null
  fecha_proxima_revision: string | null
  limpieza_intervalo_dias: number | null
  limpieza_tipo: 'interno' | 'contratado' | null
  limpieza_proveedor_id: string | null
  fecha_ultima_limpieza: string | null
  fecha_proxima_limpieza: string | null
  created_at: string
  updated_at: string
  proveedor?: Proveedor | null
  nivel?: Pick<MapaNivel, 'id' | 'nombre'> | null
}

export type Equipo = {
  id: string
  nombre: string
  area: string | null
  categoria: string | null
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  foto_url: string | null
  foto_placa_url: string | null
  estado: EstadoEquipo
  proveedor_id: string | null
  fecha_ultimo_mantenimiento: string | null
  fecha_proximo_mantenimiento: string | null
  notas: string | null
  created_at: string
  updated_at: string
  proveedor?: Proveedor | null
}

export type Infraestructura = {
  id: string
  nombre: string
  tipo: string
  area: string | null
  nivel_id: string | null
  x: number | null
  y: number | null
  estado: EstadoInfraestructura
  criticidad: CriticidadInfraestructura
  descripcion_ubicacion: string | null
  foto_url: string | null
  notas: string | null
  proveedor_id: string | null
  fecha_ultima_revision: string | null
  fecha_proxima_revision: string | null
  created_at: string
  updated_at: string
  proveedor?: Proveedor | null
  nivel?: Pick<MapaNivel, 'id' | 'nombre'> | null
}

export type Incidencia = {
  id: string
  activo_id: string | null
  equipo_id: string | null
  infraestructura_id: string | null
  zona_id: string | null
  zona_nombre: string | null
  ticket_numero: string
  descripcion: string
  prioridad: PrioridadIncidencia
  foto_url: string | null
  reportado_por: string | null
  fecha_reporte: string
  asignado_a: string | null
  fecha_resuelta: string | null
  validado_por: string | null
  estado: EstadoIncidencia
  created_at: string
  updated_at: string
  activo?: Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'> | null
  equipo?: Pick<Equipo, 'id' | 'nombre' | 'area'> | null
  infraestructura?: Pick<Infraestructura, 'id' | 'nombre' | 'area' | 'tipo'> | null
}

export type IncidenciaSeguimiento = {
  id: string
  incidencia_id: string
  texto: string
  registrado_por: string | null
  created_at: string
}

export type Mantenimiento = {
  id: string
  tipo: TipoMantenimiento
  activo_id: string | null
  equipo_id: string | null
  infraestructura_id: string | null
  incidencia_id: string | null
  zona_id: string | null
  zona_nombre: string | null
  descripcion: string
  realizado_por: string | null
  ejecucion_tipo: EjecucionMantenimiento
  requiere_material: boolean
  proveedor_id: string | null
  costo: number | null
  repuestos_notas: string | null
  fotos_urls: string[]
  fecha_realizacion: string
  proxima_fecha_sugerida: string | null
  created_at: string
  updated_at: string
  activo?: Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'> | null
  equipo?: Pick<Equipo, 'id' | 'nombre' | 'area'> | null
  infraestructura?: Pick<Infraestructura, 'id' | 'nombre' | 'area' | 'tipo'> | null
  incidencia?: Pick<Incidencia, 'id' | 'ticket_numero' | 'descripcion' | 'estado'> | null
  proveedor?: Pick<Proveedor, 'id' | 'nombre' | 'especialidad'> | null
}

export type Cotizacion = {
  id: string
  numero: string
  activo_id: string | null
  proveedor_id: string | null
  incidencia_id: string | null
  mantenimiento_id: string | null
  monto: number | null
  moneda: string
  estado: EstadoCotizacion
  fecha_emision: string
  fecha_vencimiento: string | null
  archivo_url: string | null
  notas: string | null
  created_at: string
  updated_at: string
  proveedor?: Pick<Proveedor, 'id' | 'nombre' | 'especialidad'> | null
  activo?: Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'> | null
  incidencia?: Pick<Incidencia, 'id' | 'ticket_numero' | 'descripcion'> | null
  mantenimiento?: Pick<Mantenimiento, 'id' | 'tipo' | 'fecha_realizacion'> | null
}

export type MapaZona = {
  id: string
  nivel_id: string
  parent_id: string | null
  area: string
  label: string
  nombre: string
  tipo: 'zona' | 'subzona'
  geometry_tipo: 'point' | 'rect' | 'polygon'
  geometry: Record<string, unknown> | null
  color: string | null
  descripcion: string | null
  x: number
  y: number
  visible: boolean
  orden: number
  created_at: string
  updated_at: string
}

export type MapaNivel = {
  id: string
  nombre: string
  imagen_url: string
  orden: number
  visible: boolean
  created_at: string
  updated_at: string
}

// --- Tipos del panel operativo del mapa ---

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

export type MapaIncidencia = {
  id: string
  ticket_numero: string
  descripcion: string
  prioridad: PrioridadIncidencia
  estado: EstadoIncidencia
  fecha_reporte: string
  updated_at: string
  activo_id: string | null
  equipo_id: string | null
  infraestructura_id: string | null
  zona_id: string | null
  zona_nombre: string | null
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
  zona_id: string | null
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

export type ZonaStatusTone = 'critical' | 'warning' | 'ok'

export type ZonaAggregate = {
  activos: number
  incidencias: number
  urgentes: number
  limpiezas: number
  preventivos: number
  tone: ZonaStatusTone
}

export type PanelView = 'summary' | 'assets' | 'incidents' | 'cleaning' | 'editing'
