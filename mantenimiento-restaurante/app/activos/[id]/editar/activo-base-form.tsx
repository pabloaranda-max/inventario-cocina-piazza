'use client'

import { useActionState } from 'react'
import { actualizarActivoBase } from '@/app/activos/actions'
import { ZonaSelect } from '@/components/ui/zona-select'
import { FormError } from '@/components/ui/flash-message'
import { initialFormState } from '@/lib/form-state'
import type { Activo, MapaNivel, MapaZona } from '@/lib/types'

const estadoLabels: Record<Activo['estado'], string> = {
  operativo: 'Operativo',
  pendiente_revision: 'Pendiente revisión',
  en_reparacion: 'En reparación',
  requiere_revision: 'Requiere revisión',
  obstruido: 'Obstruido',
  con_fuga: 'Con fuga',
  sin_acceso: 'Sin acceso',
  fuera_de_servicio: 'Fuera de servicio'
}

const estadosPorClase: Record<Activo['clase'], Activo['estado'][]> = {
  equipo: ['operativo', 'pendiente_revision', 'en_reparacion', 'fuera_de_servicio'],
  infraestructura: ['operativo', 'requiere_revision', 'obstruido', 'con_fuga', 'sin_acceso', 'fuera_de_servicio'],
  mobiliario: ['operativo', 'pendiente_revision', 'en_reparacion', 'requiere_revision', 'fuera_de_servicio'],
  edificacion: ['operativo', 'pendiente_revision', 'requiere_revision', 'fuera_de_servicio'],
  sistema: ['operativo', 'pendiente_revision', 'en_reparacion', 'requiere_revision', 'fuera_de_servicio']
}

type ActivoEditable = Pick<Activo, 'id' | 'clase' | 'nombre' | 'tipo' | 'estado' | 'zona_id' | 'notas'>

export function ActivoBaseForm({
  activo,
  zonas,
  niveles
}: {
  activo: ActivoEditable
  zonas: Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]
  niveles: Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]
}) {
  const action = actualizarActivoBase.bind(null, activo.id)
  const [state, formAction] = useActionState(action, initialFormState)
  const estados = estadosPorClase[activo.clase]

  return (
    <form action={formAction} className="brand-shell space-y-5 rounded-lg p-5">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="brand-label">Nombre</span>
          <input name="nombre" required defaultValue={activo.nombre} className="brand-field mt-1" />
        </label>

        <label className="block">
          <span className="brand-label">Tipo</span>
          <input name="tipo" required defaultValue={activo.tipo} className="brand-field mt-1" />
        </label>

        <label className="block">
          <span className="brand-label">Estado</span>
          <select name="estado" defaultValue={activo.estado} className="brand-field mt-1">
            {estados.map((estado) => (
              <option key={estado} value={estado}>
                {estadoLabels[estado]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="brand-label">Zona</span>
          <ZonaSelect
            name="zona_id"
            defaultValue={activo.zona_id ?? ''}
            className="brand-field mt-1"
            placeholder="Sin zona"
            zonas={zonas}
            niveles={niveles}
          />
          <p className="brand-hint mt-1">El área se deriva automáticamente de la zona seleccionada.</p>
        </label>
      </div>

      <label className="block">
        <span className="brand-label">Notas</span>
        <textarea
          name="notas"
          rows={5}
          defaultValue={activo.notas ?? ''}
          className="brand-field mt-1"
        />
      </label>

      <button type="submit" className="brand-button rounded-md px-4 py-2 text-sm font-medium">
        Guardar cambios
      </button>
    </form>
  )
}
