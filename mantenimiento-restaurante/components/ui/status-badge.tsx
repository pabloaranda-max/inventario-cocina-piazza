import type {
  EstadoEquipo,
  CriticidadInfraestructura,
  EstadoInfraestructura,
  EstadoIncidencia,
  PrioridadIncidencia,
  TipoMantenimiento,
  EstadoCotizacion
} from '@/lib/types'

type BadgeTone = 'green' | 'yellow' | 'red' | 'blue' | 'slate' | 'violet' | 'teal' | 'orange'

const toneClass: Record<BadgeTone, string> = {
  green: 'border-[rgba(47,62,30,0.16)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.22)] dark:text-[color:var(--brand-bone)]',
  yellow: 'border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] text-[#8b5e00] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(239,169,30,0.18)] dark:text-[#ffd982]',
  red: 'border-[rgba(155,30,33,0.2)] bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)] dark:border-[rgba(155,30,33,0.24)] dark:bg-[rgba(155,30,33,0.2)] dark:text-[color:var(--brand-bone)]',
  blue: 'border-[rgba(47,62,30,0.18)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(39,54,28,0.9)] dark:text-[rgba(232,239,210,0.96)]',
  slate: 'border-[rgba(47,62,30,0.12)] bg-[rgba(47,62,30,0.06)] text-[rgba(47,62,30,0.82)] dark:border-[rgba(238,227,202,0.12)] dark:bg-[rgba(238,227,202,0.08)] dark:text-[rgba(238,227,202,0.82)]',
  violet: 'border-[rgba(155,30,33,0.16)] bg-[rgba(239,169,30,0.1)] text-[color:var(--brand-wine)] dark:border-[rgba(239,169,30,0.16)] dark:bg-[rgba(155,30,33,0.18)] dark:text-[color:var(--brand-bone)]',
  teal: 'border-[rgba(47,62,30,0.18)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(49,67,33,0.9)] dark:text-[rgba(232,239,210,0.96)]',
  orange: 'border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] text-[#8f5a00] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(239,169,30,0.18)] dark:text-[#ffd982]'
}

const labels: Record<string, string> = {
  operativo: 'Operativo',
  en_reparacion: 'En reparación',
  fuera_de_servicio: 'Fuera de servicio',
  pendiente_revision: 'Pendiente revisión',
  pendiente_asignacion: 'Sin asignar',
  abierta: 'Abierta',
  en_progreso: 'En progreso',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  limpieza_profunda: 'Limpieza profunda',
  requiere_revision: 'Requiere revisión',
  obstruido: 'Obstruido',
  con_fuga: 'Con fuga',
  sin_acceso: 'Sin acceso',
  critica: 'Crítica',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada'
}

const equipoTone: Record<EstadoEquipo, BadgeTone> = {
  operativo: 'green',
  pendiente_revision: 'yellow',
  en_reparacion: 'blue',
  fuera_de_servicio: 'red'
}

const incidenciaTone: Record<EstadoIncidencia, BadgeTone> = {
  pendiente_asignacion: 'orange',
  abierta: 'yellow',
  en_progreso: 'blue',
  resuelta: 'green',
  cerrada: 'slate'
}

const prioridadTone: Record<PrioridadIncidencia, BadgeTone> = {
  baja: 'slate',
  media: 'blue',
  alta: 'yellow',
  urgente: 'red'
}

const mantenimientoTone: Record<TipoMantenimiento, BadgeTone> = {
  preventivo: 'green',
  correctivo: 'violet',
  limpieza_profunda: 'teal'
}

const cotizacionTone: Record<EstadoCotizacion, BadgeTone> = {
  pendiente_revision: 'yellow',
  aprobada: 'green',
  rechazada: 'red'
}

const infraestructuraTone: Record<EstadoInfraestructura, BadgeTone> = {
  operativo: 'green',
  requiere_revision: 'yellow',
  obstruido: 'red',
  con_fuga: 'red',
  sin_acceso: 'slate',
  fuera_de_servicio: 'red'
}

const criticidadTone: Record<CriticidadInfraestructura, BadgeTone> = {
  baja: 'slate',
  media: 'blue',
  alta: 'yellow',
  critica: 'red'
}

export function StatusBadge({
  value,
  type
}: {
  value:
    | EstadoEquipo
    | EstadoInfraestructura
    | CriticidadInfraestructura
    | EstadoIncidencia
    | PrioridadIncidencia
    | TipoMantenimiento
    | EstadoCotizacion
  type: 'equipo' | 'infraestructura' | 'criticidad' | 'incidencia' | 'prioridad' | 'mantenimiento' | 'cotizacion'
}) {
  const tone =
    type === 'equipo'
      ? equipoTone[value as EstadoEquipo]
      : type === 'incidencia'
        ? incidenciaTone[value as EstadoIncidencia]
        : type === 'prioridad'
          ? prioridadTone[value as PrioridadIncidencia]
          : type === 'mantenimiento'
            ? mantenimientoTone[value as TipoMantenimiento]
            : type === 'cotizacion'
              ? cotizacionTone[value as EstadoCotizacion]
              : type === 'infraestructura'
                ? infraestructuraTone[value as EstadoInfraestructura]
                : criticidadTone[value as CriticidadInfraestructura]

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${toneClass[tone ?? 'slate']}`}>
      {labels[value] ?? value}
    </span>
  )
}
