'use client'

import { useActionState } from 'react'
import { actualizarActivoBase } from '@/app/activos/actions'
import { ImageInput } from '@/components/ui/image-input'
import { ZonaSelect } from '@/components/ui/zona-select'
import { FormError } from '@/components/ui/flash-message'
import { initialFormState } from '@/lib/form-state'
import type { Activo, MapaNivel, MapaZona, Proveedor } from '@/lib/types'

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
  & Pick<Activo, 'criticidad' | 'proveedor_id' | 'fecha_ultima_revision' | 'fecha_proxima_revision' | 'foto_url'>

const criticidades: Array<{ value: Activo['criticidad']; label: string }> = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' }
]

export function ActivoBaseForm({
  activo,
  zonas,
  niveles,
  proveedores,
  provisional,
  fotoUrl
}: {
  activo: ActivoEditable
  zonas: Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]
  niveles: Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]
  proveedores: Pick<Proveedor, 'id' | 'nombre'>[]
  provisional: boolean
  fotoUrl?: string | null
}) {
  const action = actualizarActivoBase.bind(null, activo.id)
  const [state, formAction] = useActionState(action, initialFormState)
  const estados = estadosPorClase[activo.clase]

  return (
    <form action={formAction} className="brand-shell space-y-5 rounded-lg p-5">
      <FormError message={state.error} />

      {provisional ? (
        <div className="rounded-lg border border-[rgba(239,169,30,0.24)] bg-[rgba(239,169,30,0.1)] px-4 py-3 text-sm text-[#7a5500] dark:border-[rgba(239,169,30,0.28)] dark:bg-[rgba(90,65,24,0.56)] dark:text-[rgba(255,223,130,0.92)]">
          Este activo se creó en modo rápido y todavía está incompleto. Completa proveedor, criticidad, fechas, foto y notas para volverlo operable.
        </div>
      ) : null}

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
          <span className="brand-label">Criticidad</span>
          <select name="criticidad" defaultValue={activo.criticidad} className="brand-field mt-1">
            {criticidades.map((criticidad) => (
              <option key={criticidad.value} value={criticidad.value}>
                {criticidad.label}
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

        <label className="block">
          <span className="brand-label">Proveedor habitual</span>
          <select name="proveedor_id" defaultValue={activo.proveedor_id ?? ''} className="brand-field mt-1">
            <option value="">Sin proveedor</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="brand-label">Última revisión</span>
          <input
            name="fecha_ultima_revision"
            type="date"
            defaultValue={activo.fecha_ultima_revision ?? ''}
            className="brand-field mt-1"
          />
        </label>

        <label className="block">
          <span className="brand-label">Próxima revisión</span>
          <input
            name="fecha_proxima_revision"
            type="date"
            defaultValue={activo.fecha_proxima_revision ?? ''}
            className="brand-field mt-1"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <label className="block">
          <span className="brand-label">Notas</span>
          <textarea
            name="notas"
            rows={8}
            defaultValue={activo.notas ?? ''}
            className="brand-field mt-1"
          />
        </label>

        <div className="space-y-4">
          <ImageInput name="foto" label={fotoUrl ? 'Reemplazar foto' : 'Foto'} />
          <div className="rounded-lg border border-[color:var(--brand-border)] p-3">
            <p className="brand-label mb-2">Foto actual</p>
            {fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoUrl} alt={activo.nombre} className="h-48 w-full rounded-md object-cover" />
            ) : (
              <div className="brand-hint flex h-48 items-center justify-center rounded-md bg-[rgba(47,62,30,0.06)] dark:bg-[rgba(238,227,202,0.08)]">
                Sin foto
              </div>
            )}
          </div>
        </div>
      </div>

      <button type="submit" className="brand-button rounded-md px-4 py-2 text-sm font-medium">
        Guardar cambios
      </button>
    </form>
  )
}
