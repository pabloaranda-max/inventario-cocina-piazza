import type {
  EstadoEquipo,
  EstadoIncidencia,
  PrioridadIncidencia,
  TipoMantenimiento
} from '@/lib/types'

type BadgeTone = 'green' | 'yellow' | 'red' | 'blue' | 'slate' | 'violet'

const toneClass: Record<BadgeTone, string> = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  yellow: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-rose-200 bg-rose-50 text-rose-800',
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  slate: 'border-slate-200 bg-slate-100 text-slate-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-800'
}

const labels: Record<string, string> = {
  operativo: 'Operativo',
  en_reparacion: 'En reparación',
  fuera_de_servicio: 'Fuera de servicio',
  pendiente_revision: 'Pendiente revisión',
  abierta: 'Abierta',
  en_progreso: 'En progreso',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  urgente: 'Urgente',
  preventivo: 'Preventivo',
  correctivo: 'Correctivo'
}

const equipoTone: Record<EstadoEquipo, BadgeTone> = {
  operativo: 'green',
  pendiente_revision: 'yellow',
  en_reparacion: 'blue',
  fuera_de_servicio: 'red'
}

const incidenciaTone: Record<EstadoIncidencia, BadgeTone> = {
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
  correctivo: 'violet'
}

export function StatusBadge({
  value,
  type
}: {
  value: EstadoEquipo | EstadoIncidencia | PrioridadIncidencia | TipoMantenimiento
  type: 'equipo' | 'incidencia' | 'prioridad' | 'mantenimiento'
}) {
  const tone =
    type === 'equipo'
      ? equipoTone[value as EstadoEquipo]
      : type === 'incidencia'
        ? incidenciaTone[value as EstadoIncidencia]
        : type === 'prioridad'
          ? prioridadTone[value as PrioridadIncidencia]
          : mantenimientoTone[value as TipoMantenimiento]

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${toneClass[tone]}`}>
      {labels[value] ?? value}
    </span>
  )
}
