'use client'

import { useFormState } from 'react-dom'
import type { Activo, Cotizacion, Incidencia, Mantenimiento, Proveedor } from '@/lib/types'
import { crearCotizacion, actualizarCotizacion } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { initialFormState } from '@/lib/form-state'
import { cotizacionEstados } from '@/lib/defined-options'

export function CotizacionForm({
  proveedores,
  activos,
  incidencias,
  mantenimientos,
  cotizacion,
  defaultActivoId,
  defaultIncidenciaId,
  defaultMantenimientoId,
  defaultProveedorId,
}: {
  proveedores: Pick<Proveedor, 'id' | 'nombre'>[]
  activos: Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'>[]
  incidencias: Pick<Incidencia, 'id' | 'ticket_numero' | 'descripcion'>[]
  mantenimientos: Pick<Mantenimiento, 'id' | 'tipo' | 'fecha_realizacion'>[]
  cotizacion?: Cotizacion
  defaultActivoId?: string
  defaultIncidenciaId?: string
  defaultMantenimientoId?: string
  defaultProveedorId?: string
}) {
  const action = cotizacion ? actualizarCotizacion.bind(null, cotizacion.id) : crearCotizacion
  const [state, formAction] = useFormState(action, initialFormState)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form
      action={formAction}
      encType="multipart/form-data"
      className="brand-shell space-y-5 rounded-lg p-5"
    >
      <FormError message={state.error} />

      {/* Proveedor */}
      <label className="block">
        <span className="brand-label">Proveedor</span>
        <select
          name="proveedor_id"
          defaultValue={cotizacion?.proveedor_id ?? defaultProveedorId ?? ''}
          className="brand-field mt-1 block text-sm"
        >
          <option value="">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </label>

      {/* Activo */}
      <label className="block">
        <span className="brand-label">Activo relacionado</span>
        <select
          name="activo_id"
          defaultValue={cotizacion?.activo_id ?? defaultActivoId ?? ''}
          className="brand-field mt-1 block text-sm"
        >
          <option value="">Sin activo directo</option>
          {activos.map((activo) => (
            <option key={activo.id} value={activo.id}>
              {activo.nombre} — {activo.area ?? 'Sin zona'} · {activo.clase}
            </option>
          ))}
        </select>
      </label>

      {/* Incidencia */}
      <label className="block">
        <span className="brand-label">Incidencia relacionada</span>
        <select
          name="incidencia_id"
          defaultValue={cotizacion?.incidencia_id ?? defaultIncidenciaId ?? ''}
          className="brand-field mt-1 block text-sm"
        >
          <option value="">Sin incidencia</option>
          {incidencias.map((i) => (
            <option key={i.id} value={i.id}>
              {i.ticket_numero} — {i.descripcion.slice(0, 60)}
            </option>
          ))}
        </select>
      </label>

      {/* Mantenimiento */}
      <label className="block">
        <span className="brand-label">Mantenimiento relacionado</span>
        <select
          name="mantenimiento_id"
          defaultValue={cotizacion?.mantenimiento_id ?? defaultMantenimientoId ?? ''}
          className="brand-field mt-1 block text-sm"
        >
          <option value="">Sin mantenimiento</option>
          {mantenimientos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.tipo} — {m.fecha_realizacion}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Monto */}
        <label className="block">
          <span className="brand-label">Monto (MXN)</span>
          <input
            type="number"
            name="monto"
            min="0"
            step="0.01"
            defaultValue={cotizacion?.monto ?? ''}
            placeholder="0.00"
            className="brand-field mt-1 block text-sm"
          />
        </label>

        {/* Estado */}
        <label className="block">
          <span className="brand-label">Estado</span>
          <select
            name="estado"
            defaultValue={cotizacion?.estado ?? 'pendiente_revision'}
            className="brand-field mt-1 block text-sm"
          >
            {cotizacionEstados.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Fecha emisión */}
        <label className="block">
          <span className="brand-label">Fecha de emisión</span>
          <input
            type="date"
            name="fecha_emision"
            defaultValue={cotizacion?.fecha_emision ?? today}
            className="brand-field mt-1 block text-sm"
          />
        </label>

        {/* Fecha vencimiento */}
        <label className="block">
          <span className="brand-label">Válida hasta</span>
          <input
            type="date"
            name="fecha_vencimiento"
            defaultValue={cotizacion?.fecha_vencimiento ?? ''}
            className="brand-field mt-1 block text-sm"
          />
        </label>
      </div>

      {/* Archivo */}
      <div className="block">
        <span className="brand-label">
          Archivo (PDF o imagen)
        </span>
        {cotizacion?.archivo_url && (
          <div className="mt-2 flex items-center gap-3">
            <span className="brand-hint text-sm">Archivo actual guardado</span>
            <label className="brand-hint flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="reemplazar_archivo"
                className="h-4 w-4 rounded border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] text-[color:var(--brand-wine)] accent-[color:var(--brand-wine)]"
              />
              Reemplazar archivo
            </label>
          </div>
        )}
        <input
          type="file"
          name="archivo"
          accept="image/*,application/pdf"
          className="brand-hint mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-[rgba(47,62,30,0.14)] file:bg-[rgba(255,253,248,0.82)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[color:var(--brand-green)] hover:file:bg-[rgba(239,169,30,0.1)] dark:file:border-[rgba(238,227,202,0.12)] dark:file:bg-[rgba(22,32,18,0.72)] dark:file:text-[color:var(--brand-bone)]"
        />
      </div>

      {/* Notas */}
      <label className="block">
        <span className="brand-label">Notas</span>
        <textarea
          name="notas"
          rows={3}
          defaultValue={cotizacion?.notas ?? ''}
          placeholder="Observaciones, condiciones, vigencia..."
          className="brand-field mt-1 block text-sm"
        />
      </label>

      <button
        type="submit"
        className="brand-button rounded-md px-4 py-2 text-sm font-medium"
      >
        {cotizacion ? 'Guardar cambios' : 'Registrar cotización'}
      </button>
    </form>
  )
}
