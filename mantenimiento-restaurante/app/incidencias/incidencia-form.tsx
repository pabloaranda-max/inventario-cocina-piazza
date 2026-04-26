'use client'

import { useActionState } from 'react'
import type { Activo, Incidencia, MapaZona } from '@/lib/types'
import { actualizarIncidencia, crearIncidencia } from './actions'
import { toDateInputMX } from '@/lib/utils'
import { FormError } from '@/components/ui/flash-message'
import { ImageInput } from '@/components/ui/image-input'
import { initialFormState } from '@/lib/form-state'

const prioridades = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' }
]

export function ReporteRapidoForm() {
  const [state, formAction] = useActionState(crearIncidencia, initialFormState)

  return (
    <form action={formAction} className="brand-shell space-y-5 rounded-lg p-5">
      <FormError message={state.error} />

      <label className="block">
        <span className="brand-label">Tu nombre</span>
        <input
          name="reportado_por"
          required
          placeholder="¿Quién reporta?"
          className="brand-field mt-1 text-base"
        />
      </label>

      <label className="block">
        <span className="brand-label">¿Qué pasó?</span>
        <textarea
          name="descripcion"
          required
          rows={4}
          placeholder="Describe brevemente el problema..."
          className="brand-field mt-1 text-base"
        />
      </label>

      <label className="block">
        <span className="brand-label">Prioridad</span>
        <select
          name="prioridad"
          defaultValue="media"
          className="brand-field mt-1 text-base"
        >
          {prioridades.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>

      <ImageInput name="foto" label="Foto del problema (opcional)" />

      <label className="block">
        <span className="brand-label">Tu correo <span className="font-normal text-[rgba(47,62,30,0.5)] dark:text-[rgba(238,227,202,0.45)]">(opcional — para recibir copia)</span></span>
        <input
          name="email_reportador"
          type="email"
          placeholder="correo@ejemplo.com"
          className="brand-field mt-1 text-base"
        />
      </label>

      <button
        type="submit"
        className="brand-button w-full rounded-md px-4 py-3 text-base font-semibold"
      >
        Enviar reporte
      </button>
    </form>
  )
}

export function IncidenciaForm({
  activos,
  selectedActivoId,
  zonas,
  selectedZonaId,
  incidencia
}: {
  activos: Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'>[]
  selectedActivoId?: string
  zonas: Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label'>[]
  selectedZonaId?: string
  incidencia: Incidencia
}) {
  const [state, formAction] = useActionState(
    actualizarIncidencia.bind(null, incidencia.id),
    initialFormState
  )

  return (
    <form action={formAction} className="brand-shell space-y-5 rounded-lg p-5">
      <FormError message={state.error} />

      <label className="block">
        <span className="brand-label">Activo</span>
        <select
          name="activo_id"
          defaultValue={incidencia.activo_id ?? selectedActivoId ?? ''}
          className="brand-field mt-1"
        >
          <option value="">Sin activo específico</option>
          {activos.map((activo) => (
            <option key={activo.id} value={activo.id}>
              {activo.nombre} · {activo.tipo} · {activo.clase}
              {activo.area ? ` - ${activo.area}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="brand-label">Zona del mapa</span>
        <select
          name="zona_id"
          defaultValue={incidencia.zona_id ?? selectedZonaId ?? ''}
          className="brand-field mt-1"
        >
          <option value="">Sin zona específica</option>
          {zonas.map((zona) => (
            <option key={zona.id} value={zona.id}>
              {zona.nombre || zona.label}
              {zona.area ? ` · ${zona.area}` : ''}
            </option>
          ))}
        </select>
        <span className="brand-hint mt-1 block">
          Si seleccionas un activo con zona, se usará la zona del activo.
        </span>
      </label>

      <label className="block">
        <span className="brand-label">Descripción</span>
        <textarea
          name="descripcion"
          required
          rows={5}
          defaultValue={incidencia.descripcion}
          className="brand-field mt-1"
        />
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="brand-label">Prioridad</span>
          <select
            name="prioridad"
            defaultValue={incidencia.prioridad}
            className="brand-field mt-1"
          >
            {prioridades.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="brand-label">Reportado por</span>
          <input
            name="reportado_por"
            defaultValue={incidencia.reportado_por ?? ''}
            className="brand-field mt-1"
          />
        </label>

        <label className="block">
          <span className="brand-label">Fecha</span>
          <input
            name="fecha_reporte"
            type="date"
            defaultValue={incidencia.fecha_reporte ? toDateInputMX(incidencia.fecha_reporte) : ''}
            className="brand-field mt-1"
          />
        </label>
      </div>

      <label className="block">
        <span className="brand-label">Estado</span>
        <select
          name="estado"
          defaultValue={incidencia.estado}
          className="brand-field mt-1"
        >
          <option value="pendiente_asignacion">Sin asignar</option>
          <option value="abierta">Abierta</option>
          <option value="en_progreso">En progreso</option>
          <option value="resuelta">Resuelta</option>
          <option value="cerrada">Cerrada</option>
        </select>
      </label>

      <ImageInput name="foto" label="Reemplazar foto" />

      <button
        type="submit"
        className="brand-button rounded-md px-4 py-2 text-sm font-medium"
      >
        Guardar cambios
      </button>
    </form>
  )
}
