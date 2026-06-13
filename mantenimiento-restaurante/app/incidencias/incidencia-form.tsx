'use client'

import { useActionState, useEffect, useState } from 'react'
import type { Activo, Incidencia, MapaNivel, MapaZona } from '@/lib/types'
import { ZonaSelect } from '@/components/ui/zona-select'
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
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (state.error) setPending(false)
  }, [state.error])

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="brand-shell space-y-5 rounded-lg p-5">
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
        disabled={pending}
        className="brand-button w-full rounded-md px-4 py-3 text-base font-semibold disabled:opacity-60"
      >
        {pending ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Enviando...
          </span>
        ) : 'Enviar reporte'}
      </button>
    </form>
  )
}

type ActivoOption = Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo' | 'zona_id'>

export function IncidenciaForm({
  activos,
  selectedActivoId,
  zonas,
  niveles,
  selectedZonaId,
  incidencia
}: {
  activos: ActivoOption[]
  selectedActivoId?: string
  zonas: Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label' | 'nivel_id'>[]
  niveles: Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]
  selectedZonaId?: string
  incidencia: Incidencia
}) {
  const [state, formAction] = useActionState(
    actualizarIncidencia.bind(null, incidencia.id),
    initialFormState
  )

  const initialActivoId = incidencia.activo_id ?? selectedActivoId ?? ''
  const initialActivo = activos.find((a) => a.id === initialActivoId)
  const initialZonaId =
    initialActivo?.zona_id ?? incidencia.zona_id ?? selectedZonaId ?? ''

  const [activoId, setActivoId] = useState(initialActivoId)
  const [zonaId, setZonaId] = useState(initialZonaId)
  const [zonaFromActivo, setZonaFromActivo] = useState(
    Boolean(initialActivo?.zona_id)
  )

  function handleActivoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    setActivoId(id)
    const activo = activos.find((a) => a.id === id)
    if (activo?.zona_id) {
      setZonaId(activo.zona_id)
      setZonaFromActivo(true)
    } else {
      setZonaFromActivo(false)
      if (id === '') setZonaId('')
    }
  }

  const zonaNombreAuto = zonaFromActivo
    ? (zonas.find((z) => z.id === zonaId)?.nombre ?? null)
    : null

  return (
    <form action={formAction} className="brand-shell space-y-5 rounded-lg p-5">
      <FormError message={state.error} />

      <label className="block">
        <span className="brand-label">Activo</span>
        <select
          name="activo_id"
          value={activoId}
          onChange={handleActivoChange}
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

      <div className="block">
        <span className="brand-label">Zona del mapa</span>
        {zonaFromActivo ? (
          <>
            <input type="hidden" name="zona_id" value={zonaId} />
            <div className="brand-field mt-1 text-[color:var(--brand-muted)]">
              {zonaNombreAuto ?? zonaId}
            </div>
            <span className="brand-hint mt-1 block text-xs">
              Zona asignada automáticamente desde el activo.
            </span>
          </>
        ) : (
          <>
            <ZonaSelect
              name="zona_id"
              value={zonaId}
              onChange={(e) => setZonaId(e.target.value)}
              className="brand-field mt-1"
              placeholder="Sin zona específica"
              zonas={zonas}
              niveles={niveles}
            />
            <span className="brand-hint mt-1 block">
              Si seleccionas un activo con zona, se asignará automáticamente.
            </span>
          </>
        )}
      </div>

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
