export type EstadoEquipo =
  | 'operativo'
  | 'en_reparacion'
  | 'fuera_de_servicio'
  | 'pendiente_revision'

export type PrioridadIncidencia = 'baja' | 'media' | 'alta' | 'urgente'
export type EstadoIncidencia = 'abierta' | 'en_progreso' | 'resuelta' | 'cerrada'
export type TipoMantenimiento = 'preventivo' | 'correctivo'

export type Proveedor = {
  id: string
  nombre: string
  especialidad: string | null
  telefono: string | null
  contacto: string | null
  telefono_secundario: string | null
  contacto_secundario: string | null
  notas: string | null
  created_at: string
  updated_at: string
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

export type Incidencia = {
  id: string
  equipo_id: string | null
  descripcion: string
  prioridad: PrioridadIncidencia
  foto_url: string | null
  reportado_por: string | null
  fecha_reporte: string
  estado: EstadoIncidencia
  created_at: string
  updated_at: string
  equipo?: Pick<Equipo, 'id' | 'nombre' | 'area'> | null
}

export type Mantenimiento = {
  id: string
  tipo: TipoMantenimiento
  equipo_id: string
  descripcion: string
  realizado_por: string | null
  costo: number | null
  repuestos_notas: string | null
  fotos_urls: string[]
  fecha_realizacion: string
  proxima_fecha_sugerida: string | null
  created_at: string
  updated_at: string
  equipo?: Pick<Equipo, 'id' | 'nombre' | 'area'> | null
}
