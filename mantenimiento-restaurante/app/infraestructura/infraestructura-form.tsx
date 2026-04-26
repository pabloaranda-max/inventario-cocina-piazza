'use client'

import { useState, useActionState } from 'react'
import { actualizarInfraestructura, crearInfraestructura } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { ImageInput } from '@/components/ui/image-input'
import { infraestructuraTipos, limpiezaIntervalos } from '@/lib/defined-options'
import { initialFormState } from '@/lib/form-state'
import type { Activo, Infraestructura, MapaZona, Proveedor } from '@/lib/types'
import { addDaysToDateInput } from '@/lib/utils'

const estados = [
  ['operativo', 'Operativo'],
  ['requiere_revision', 'Requiere revisión'],
  ['obstruido', 'Obstruido'],
  ['con_fuga', 'Con fuga'],
  ['sin_acceso', 'Sin acceso'],
  ['fuera_de_servicio', 'Fuera de servicio']
]

const criticidades = [
  ['baja', 'Baja'],
  ['media', 'Media'],
  ['alta', 'Alta'],
  ['critica', 'Crítica']
]

function computeNextCleaningDate(lastDate: string, intervalDays: string) {
  if (!lastDate || !intervalDays) return ''
  return addDaysToDateInput(lastDate, Number(intervalDays))
}

export function InfraestructuraForm({
  infraestructura,
  proveedores,
  areas,
  zonas,
  activo
}: {
  infraestructura?: Infraestructura
  proveedores: Proveedor[]
  areas: string[]
  zonas: Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area'>[]
  activo?: Pick<Activo, 'limpieza_intervalo_dias' | 'limpieza_tipo' | 'limpieza_proveedor_id' | 'fecha_ultima_limpieza' | 'fecha_proxima_limpieza' | 'zona_id'>
}) {
  const action = infraestructura ? actualizarInfraestructura.bind(null, infraestructura.id) : crearInfraestructura
  const [state, formAction] = useActionState(action, initialFormState)
  const [limpiezaEnabled, setLimpiezaEnabled] = useState(Boolean(activo?.limpieza_intervalo_dias))
  const [limpiezaIntervalo, setLimpiezaIntervalo] = useState(activo?.limpieza_intervalo_dias?.toString() ?? '')
  const [limpiezaTipo, setLimpiezaTipo] = useState<'interno' | 'contratado'>(activo?.limpieza_tipo ?? 'interno')
  const [fechaUltimaLimpieza, setFechaUltimaLimpieza] = useState(activo?.fecha_ultima_limpieza ?? '')
  const [fechaProximaLimpieza, setFechaProximaLimpieza] = useState(
    activo?.fecha_proxima_limpieza ?? computeNextCleaningDate(activo?.fecha_ultima_limpieza ?? '', activo?.limpieza_intervalo_dias?.toString() ?? '')
  )

  return (
    <form action={formAction} className="brand-shell space-y-5 rounded-lg p-5">
      <FormError message={state.error} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre" name="nombre" defaultValue={infraestructura?.nombre} required />
        <label className="block">
          <span className="brand-label">Zona</span>
          <select name="zona_id" defaultValue={activo?.zona_id ?? ''} required className="brand-field mt-1">
            <option value="">Selecciona una zona</option>
            {zonas.map((zona) => (
              <option key={zona.id} value={zona.id}>
                {(zona.nombre || zona.label) ?? 'Zona'}{zona.area ? ` · ${zona.area}` : ''}
              </option>
            ))}
          </select>
          <p className="brand-hint mt-1">La infraestructura se asigna por zona; no se captura punto exacto.</p>
        </label>

        <label className="block">
          <span className="brand-label">Tipo</span>
          <input
            name="tipo"
            list="infraestructura-tipos"
            defaultValue={infraestructura?.tipo ?? ''}
            required
            className="brand-field mt-1"
          />
          <datalist id="infraestructura-tipos">
            {infraestructuraTipos.map((tipo) => (
              <option key={tipo} value={tipo} />
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="brand-label">Área</span>
          <input
            name="area"
            list="infraestructura-areas"
            defaultValue={infraestructura?.area ?? ''}
            className="brand-field mt-1"
          />
          <datalist id="infraestructura-areas">
            {areas.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="brand-label">Proveedor habitual</span>
          <select
            name="proveedor_id"
            defaultValue={infraestructura?.proveedor_id ?? ''}
            className="brand-field mt-1"
          >
            <option value="">Sin proveedor</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="brand-label">Estado</span>
          <select
            name="estado"
            defaultValue={infraestructura?.estado ?? 'operativo'}
            className="brand-field mt-1"
          >
            {estados.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="brand-label">Criticidad</span>
          <select
            name="criticidad"
            defaultValue={infraestructura?.criticidad ?? 'media'}
            className="brand-field mt-1"
          >
            {criticidades.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <Field
          label="Última revisión"
          name="fecha_ultima_revision"
          type="date"
          defaultValue={infraestructura?.fecha_ultima_revision}
        />
        <Field
          label="Próxima revisión"
          name="fecha_proxima_revision"
          type="date"
          defaultValue={infraestructura?.fecha_proxima_revision}
        />
      </div>

      <div className="brand-card rounded-md p-3">
        <p className="brand-label">Asignación de zona</p>
        <p className="brand-hint mt-1 text-sm">
          Usa la zona para ubicar la infraestructura dentro del mapa operativo.
        </p>
        {infraestructura ? (
          <a
            href={`/activos/${infraestructura.id}/ubicacion`}
            className="brand-button-muted mt-3 inline-flex rounded-md px-3 py-2 text-sm font-medium"
          >
            Asignar zona
          </a>
        ) : (
          <p className="brand-hint mt-2 text-sm">
            Selecciona la zona desde este formulario.
          </p>
        )}
      </div>

      <label className="block">
        <span className="brand-label">Descripción de ubicación</span>
        <textarea
          name="descripcion_ubicacion"
          rows={3}
          defaultValue={infraestructura?.descripcion_ubicacion ?? ''}
          className="brand-field mt-1"
        />
      </label>

      <label className="block">
        <span className="brand-label">Notas técnicas</span>
        <textarea
          name="notas"
          rows={4}
          defaultValue={infraestructura?.notas ?? ''}
          className="brand-field mt-1"
        />
      </label>

      <ImageInput name="foto" label={infraestructura ? 'Reemplazar foto' : 'Foto opcional'} />

      {/* Limpieza profunda */}
      <fieldset className="brand-card rounded-md p-4">
        <legend className="brand-label px-1">Limpieza profunda</legend>
        <label className="flex items-center gap-2 text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
          <input
            type="checkbox"
            name="limpieza_enabled"
            checked={limpiezaEnabled}
            onChange={(e) => setLimpiezaEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] text-[color:var(--brand-wine)] accent-[color:var(--brand-wine)]"
          />
          Habilitar limpieza profunda calendarizada
        </label>

        {limpiezaEnabled && (
          <div className="mt-4 space-y-4">
            {/* Tipo */}
            <div className="flex gap-4">
              {(['interno', 'contratado'] as const).map((tipo) => (
                <label key={tipo} className="flex cursor-pointer items-center gap-2 text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
                  <input
                    type="radio"
                    name="limpieza_tipo"
                    value={tipo}
                    checked={limpiezaTipo === tipo}
                    onChange={() => setLimpiezaTipo(tipo)}
                  />
                  {tipo === 'interno' ? 'Proceso interno' : 'Servicio contratado'}
                </label>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="brand-label">Intervalo</span>
                <select
                  name="limpieza_intervalo_dias"
                  value={limpiezaIntervalo}
                  onChange={(e) => {
                    const nextInterval = e.target.value
                    setLimpiezaIntervalo(nextInterval)
                    const nextDate = computeNextCleaningDate(fechaUltimaLimpieza, nextInterval)
                    if (nextDate) setFechaProximaLimpieza(nextDate)
                  }}
                  className="brand-field mt-1"
                >
                  <option value="">Selecciona...</option>
                  {limpiezaIntervalos.map((i) => (
                    <option key={i.dias} value={i.dias}>{i.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="brand-label">Última limpieza</span>
                <input
                  type="date"
                  name="fecha_ultima_limpieza"
                  value={fechaUltimaLimpieza}
                  onChange={(e) => {
                    const nextLastDate = e.target.value
                    setFechaUltimaLimpieza(nextLastDate)
                    const nextDate = computeNextCleaningDate(nextLastDate, limpiezaIntervalo)
                    if (nextDate) setFechaProximaLimpieza(nextDate)
                  }}
                  className="brand-field mt-1"
                />
              </label>

              <label className="block">
                <span className="brand-label">Próxima limpieza</span>
                <input
                  type="date"
                  name="fecha_proxima_limpieza"
                  value={fechaProximaLimpieza}
                  onChange={(e) => setFechaProximaLimpieza(e.target.value)}
                  className="brand-field mt-1"
                />
              </label>
            </div>

            {/* Proveedor (solo si contratado) */}
            {limpiezaTipo === 'contratado' && (
              <label className="block">
                <span className="brand-label">Proveedor de limpieza</span>
                <select
                  name="limpieza_proveedor_id"
                  defaultValue={activo?.limpieza_proveedor_id ?? ''}
                  className="brand-field mt-1"
                >
                  <option value="">Sin asignar</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </fieldset>

      <button
        type="submit"
        className="brand-button rounded-md px-4 py-2 text-sm font-medium"
      >
        {infraestructura ? 'Guardar cambios' : 'Crear infraestructura'}
      </button>
    </form>
  )
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required = false
}: {
  label: string
  name: string
  defaultValue?: string | null
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="brand-label">{label}</span>
      <input
        name={name}
        type={type}
        min={type === 'number' ? '0' : undefined}
        max={type === 'number' ? '100' : undefined}
        step={type === 'number' ? '0.001' : undefined}
        defaultValue={defaultValue ?? ''}
        required={required}
        className="brand-field mt-1"
      />
    </label>
  )
}
