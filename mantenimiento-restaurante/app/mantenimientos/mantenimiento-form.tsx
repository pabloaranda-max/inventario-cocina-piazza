'use client'

import { useState, useActionState, useRef, useTransition } from 'react'
import type { Activo, EjecucionMantenimiento, Equipo, Infraestructura, Mantenimiento, MapaNivel, MapaZona, Proveedor, TipoMantenimiento } from '@/lib/types'
import { ZonaSelect } from '@/components/ui/zona-select'
import { actualizarMantenimiento, crearMantenimiento } from './actions'
import { todayMX } from '@/lib/utils'
import { FormError } from '@/components/ui/flash-message'
import { ImageInput } from '@/components/ui/image-input'
import { initialFormState } from '@/lib/form-state'

type ActivoOption = Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo' | 'zona_id'>

type IncidenciaOption = {
  id: string
  ticket_numero: string
  descripcion: string
  activo?: Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'> | null
  equipo?: Pick<Equipo, 'id' | 'nombre' | 'area'> | null
  infraestructura?: Pick<Infraestructura, 'id' | 'nombre' | 'area' | 'tipo'> | null
}

export function MantenimientoForm({
  mantenimiento,
  activos,
  zonas,
  niveles,
  proveedores,
  incidencias,
  selectedActivoId,
  selectedIncidenciaId,
  selectedZonaId,
  selectedTipo
}: {
  mantenimiento?: Mantenimiento
  activos: ActivoOption[]
  zonas: Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label' | 'nivel_id'>[]
  niveles: Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]
  proveedores: Pick<Proveedor, 'id' | 'nombre' | 'especialidad'>[]
  incidencias: IncidenciaOption[]
  selectedActivoId?: string
  selectedIncidenciaId?: string
  selectedZonaId?: string
  selectedTipo?: Mantenimiento['tipo']
}) {
  const action = mantenimiento ? actualizarMantenimiento.bind(null, mantenimiento.id) : crearMantenimiento
  const [state, formAction] = useActionState(action, initialFormState)

  const fotosRef = useRef<File[]>([])
  const [, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.delete('fotos')
    fotosRef.current.forEach((f) => fd.append('fotos', f))
    startTransition(() => formAction(fd))
  }

  const initialActivoId = mantenimiento?.activo_id ?? selectedActivoId ?? ''
  const initialActivo = activos.find((a) => a.id === initialActivoId) ?? null
  const [activoId, setActivoId] = useState(initialActivoId)
  const [zonaId, setZonaId] = useState(
    mantenimiento?.zona_id ?? (initialActivo?.zona_id ?? selectedZonaId ?? '')
  )
  const [zonaFromActivo, setZonaFromActivo] = useState(Boolean(initialActivo?.zona_id))

  function handleActivoChange(newId: string) {
    setActivoId(newId)
    const found = activos.find((a) => a.id === newId)
    if (found?.zona_id) {
      setZonaId(found.zona_id)
      setZonaFromActivo(true)
    } else {
      setZonaFromActivo(false)
    }
  }

  const [tipo, setTipo] = useState<TipoMantenimiento>(mantenimiento?.tipo ?? selectedTipo ?? 'preventivo')
  const initialEjecucion: EjecucionMantenimiento = mantenimiento?.ejecucion_tipo ?? (mantenimiento?.proveedor_id ? 'externo' : 'interno')
  const [ejecucionTipo, setEjecucionTipo] = useState<EjecucionMantenimiento>(initialEjecucion)
  const [requiereMaterial, setRequiereMaterial] = useState(Boolean(mantenimiento?.requiere_material))

  const isEditing = Boolean(mantenimiento)
  const modePlaneado = isEditing ? mantenimiento!.estado_ejecucion === 'planeado' : true

  const isExterno = ejecucionTipo === 'externo'
  const showCosto = !modePlaneado && (isExterno || requiereMaterial)

  const zonaLabel = zonaFromActivo
    ? zonas.find((z) => z.id === zonaId)?.label ?? zonas.find((z) => z.id === zonaId)?.nombre ?? zonaId
    : null

  return (
    <form onSubmit={handleSubmit} className="brand-shell space-y-5 rounded-lg p-5">
      <FormError message={state?.error} />

      <input type="hidden" name="estado_ejecucion" value={modePlaneado ? 'planeado' : 'aplicado'} />

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="brand-label">Activo</span>
          <select
            name="activo_id"
            value={activoId}
            onChange={(e) => handleActivoChange(e.target.value)}
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
          <span className="brand-hint mt-1 block">
            Preventivos y correctivos requieren activo. Limpieza profunda puede quedar sin activo.
          </span>
        </label>

        <label className="block">
          <span className="brand-label">Tipo</span>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoMantenimiento)}
            className="brand-field mt-1"
          >
            <option value="preventivo">Preventivo</option>
            <option value="correctivo">Correctivo</option>
            <option value="limpieza_profunda">Limpieza profunda</option>
          </select>
        </label>

        <div className="block md:col-span-2">
          <span className="brand-label">Zona del mapa</span>
          {zonaFromActivo ? (
            <>
              <input type="hidden" name="zona_id" value={zonaId} />
              <div className="brand-field mt-1 text-[color:var(--brand-muted)]">
                {zonaLabel} <span className="brand-hint">(del activo)</span>
              </div>
            </>
          ) : (
            <ZonaSelect
              name="zona_id"
              defaultValue={zonaId}
              className="brand-field mt-1"
              placeholder="Sin zona específica"
              zonas={zonas}
              niveles={niveles}
            />
          )}
        </div>

        <label className="block md:col-span-2">
          <span className="brand-label">Incidencia relacionada</span>
          <select
            name="incidencia_id"
            defaultValue={mantenimiento?.incidencia_id ?? selectedIncidenciaId ?? ''}
            className="brand-field mt-1"
          >
            <option value="">Sin incidencia relacionada</option>
            {incidencias.map((incidencia) => (
              <option key={incidencia.id} value={incidencia.id}>
                {incidencia.ticket_numero} ·{' '}
                {incidencia.activo?.nombre ?? incidencia.equipo?.nombre ?? incidencia.infraestructura?.nombre ?? 'Sin destino'} ·{' '}
                {incidencia.descripcion}
              </option>
            ))}
          </select>
        </label>

        {!modePlaneado && (
          <label className="block">
            <span className="brand-label">Realizado por</span>
            <input
              name="realizado_por"
              defaultValue={mantenimiento?.realizado_por ?? ''}
              className="brand-field mt-1"
            />
          </label>
        )}

        <fieldset className="block">
          <legend className="brand-label">Ejecución</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              ejecucionTipo === 'interno'
                ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                : 'border-[rgba(47,62,30,0.14)] text-[color:var(--brand-green)] dark:border-[rgba(238,227,202,0.12)] dark:text-[color:var(--brand-bone)]'
            }`}>
              <input
                type="radio"
                name="ejecucion_tipo"
                value="interno"
                checked={ejecucionTipo === 'interno'}
                onChange={() => setEjecucionTipo('interno')}
              />
              Interno
            </label>
            <label className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              ejecucionTipo === 'externo'
                ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                : 'border-[rgba(47,62,30,0.14)] text-[color:var(--brand-green)] dark:border-[rgba(238,227,202,0.12)] dark:text-[color:var(--brand-bone)]'
            }`}>
              <input
                type="radio"
                name="ejecucion_tipo"
                value="externo"
                checked={ejecucionTipo === 'externo'}
                onChange={() => {
                  setEjecucionTipo('externo')
                  setRequiereMaterial(true)
                }}
              />
              Externo
            </label>
          </div>
        </fieldset>

        {!isExterno ? (
          <label className="brand-card flex items-start gap-2 rounded-md p-3 text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
            <input
              name="requiere_material"
              type="checkbox"
              checked={requiereMaterial}
              onChange={(event) => setRequiereMaterial(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] text-[color:var(--brand-wine)] accent-[color:var(--brand-wine)]"
            />
            <span>
              Requiere material
              <span className="brand-hint block">Activa costo de material para trabajo interno.</span>
            </span>
          </label>
        ) : (
          <input type="hidden" name="requiere_material" value="on" />
        )}

        {isExterno ? (
          <label className="block">
            <span className="brand-label">Proveedor</span>
            <select
              name="proveedor_id"
              required
              defaultValue={mantenimiento?.proveedor_id ?? ''}
              className="brand-field mt-1"
            >
              <option value="">Selecciona proveedor</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.nombre}
                  {proveedor.especialidad ? ` · ${proveedor.especialidad}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {modePlaneado ? (
          <label className="block">
            <span className="brand-label">Costo estimado</span>
            <input
              name="costo_estimado"
              type="number"
              min="0"
              step="0.01"
              defaultValue={mantenimiento?.costo_estimado ?? ''}
              placeholder="Opcional"
              className="brand-field mt-1"
            />
          </label>
        ) : showCosto ? (
          <label className="block">
            <span className="brand-label">
              {isExterno ? 'Costo del servicio' : 'Costo de material'}
            </span>
            <input
              name="costo"
              type="number"
              min="0"
              step="0.01"
              defaultValue={mantenimiento?.costo ?? ''}
              className="brand-field mt-1"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="brand-label">{modePlaneado ? 'Fecha planeada' : 'Fecha de realizacion'}</span>
          <input
            name="fecha_realizacion"
            type="date"
            defaultValue={mantenimiento?.fecha_realizacion ?? todayMX()}
            className="brand-field mt-1"
          />
        </label>

        {!modePlaneado && tipo !== 'correctivo' && (
          <label className="block">
            <span className="brand-label">Proxima fecha sugerida</span>
            <input
              name="proxima_fecha_sugerida"
              type="date"
              defaultValue={mantenimiento?.proxima_fecha_sugerida ?? ''}
              className="brand-field mt-1"
            />
          </label>
        )}
      </div>

      {!modePlaneado && (
        <label className="brand-card flex items-start gap-2 rounded-md p-3 text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
          <input
            name="marcar_operativo"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] text-[color:var(--brand-wine)] accent-[color:var(--brand-wine)]"
          />
          <span>Marcar el activo como operativo al registrar este mantenimiento</span>
        </label>
      )}

      <label className="block">
        <span className="brand-label">{modePlaneado ? 'Qué se va a hacer' : 'Descripcion'}</span>
        <textarea
          name="descripcion"
          required
          rows={5}
          defaultValue={mantenimiento?.descripcion ?? ''}
          className="brand-field mt-1"
        />
      </label>

      <label className="block">
        <span className="brand-label">Repuestos o notas</span>
        <textarea
          name="repuestos_notas"
          rows={3}
          defaultValue={mantenimiento?.repuestos_notas ?? ''}
          className="brand-field mt-1"
        />
      </label>

      {!modePlaneado && (
        <ImageInput
          name="fotos"
          label={mantenimiento ? 'Agregar fotos' : 'Fotos opcionales'}
          multiple
          onFilesSelected={(files) => { fotosRef.current = [...fotosRef.current, ...files] }}
        />
      )}

      <button
        type="submit"
        className="brand-button rounded-md px-4 py-2 text-sm font-medium"
      >
        {mantenimiento ? 'Guardar cambios' : modePlaneado ? 'Guardar plan' : 'Registrar mantenimiento'}
      </button>
    </form>
  )
}
