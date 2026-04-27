'use client'

import { useState, useActionState } from 'react'
import type { Activo, Equipo, MapaNivel, MapaZona, Proveedor } from '@/lib/types'
import { crearEquipo, actualizarEquipo } from './actions'
import { FormError } from '@/components/ui/flash-message'
import { MultipleDefinedCheckboxes } from '@/components/ui/defined-fields'
import { ZonaSelect } from '@/components/ui/zona-select'
import { ImageInput } from '@/components/ui/image-input'
import { equipoCategorias, limpiezaIntervalos } from '@/lib/defined-options'
import { initialFormState } from '@/lib/form-state'
import { addDaysToDateInput } from '@/lib/utils'

const estados = [
  ['operativo', 'Operativo'],
  ['en_reparacion', 'En reparación'],
  ['fuera_de_servicio', 'Fuera de servicio'],
  ['pendiente_revision', 'Pendiente revisión']
]

function computeNextCleaningDate(lastDate: string, intervalDays: string) {
  if (!lastDate || !intervalDays) return ''
  return addDaysToDateInput(lastDate, Number(intervalDays))
}

export function EquipoForm({
  equipo,
  fotoUrl,
  fotoPlacaUrl,
  proveedores,
  zonas,
  niveles,
  activo
}: {
  equipo?: Equipo
  fotoUrl?: string | null
  fotoPlacaUrl?: string | null
  proveedores: Proveedor[]
  zonas: Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]
  niveles: Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]
  activo?: Pick<Activo, 'limpieza_intervalo_dias' | 'limpieza_tipo' | 'limpieza_proveedor_id' | 'fecha_ultima_limpieza' | 'fecha_proxima_limpieza' | 'zona_id'>
}) {
  const action = equipo ? actualizarEquipo.bind(null, equipo.id) : crearEquipo
  const [state, formAction] = useActionState(action, initialFormState)

  const [marca, setMarca] = useState(equipo?.marca ?? '')
  const [modelo, setModelo] = useState(equipo?.modelo ?? '')
  const [numeroSerie, setNumeroSerie] = useState(equipo?.numero_serie ?? '')
  const [notas, setNotas] = useState(equipo?.notas ?? '')
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
        <Field label="Nombre" name="nombre" defaultValue={equipo?.nombre} required />
        <label className="block">
          <span className="brand-label">Zona</span>
          <ZonaSelect
            name="zona_id"
            defaultValue={activo?.zona_id ?? ''}
            required
            className="brand-field mt-1"
            zonas={zonas}
            niveles={niveles}
          />
          <p className="brand-hint mt-1">El activo se ubicará por zona; ya no se usa pin exacto.</p>
        </label>
        <div className="md:col-span-2">
          <MultipleDefinedCheckboxes
            label="Categorías"
            name="categoria"
            otherName="categoria_otro"
            options={equipoCategorias}
            defaultValue={equipo?.categoria}
          />
        </div>

        <label className="block">
          <span className="brand-label">Marca</span>
          <input
            name="marca"
            type="text"
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            className="brand-field mt-1"
          />
        </label>

        <label className="block">
          <span className="brand-label">Modelo</span>
          <input
            name="modelo"
            type="text"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            className="brand-field mt-1"
          />
        </label>

        <label className="block">
          <span className="brand-label">Numero de serie</span>
          <input
            name="numero_serie"
            type="text"
            value={numeroSerie}
            onChange={(e) => setNumeroSerie(e.target.value)}
            className="brand-field mt-1"
          />
        </label>

        <label className="block">
          <span className="brand-label">Estado</span>
          <select
            name="estado"
            defaultValue={equipo?.estado ?? 'operativo'}
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
          <span className="brand-label">Proveedor habitual</span>
          <select
            name="proveedor_id"
            defaultValue={equipo?.proveedor_id ?? ''}
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

        <Field
          label="Ultimo mantenimiento"
          name="fecha_ultimo_mantenimiento"
          type="date"
          defaultValue={equipo?.fecha_ultimo_mantenimiento}
        />
        <Field
          label="Proximo mantenimiento"
          name="fecha_proximo_mantenimiento"
          type="date"
          defaultValue={equipo?.fecha_proximo_mantenimiento}
        />

        <div>
          <ImageInput name="foto" label={fotoUrl ? 'Reemplazar foto general' : 'Foto general'} />
          {fotoUrl && (
            <img src={fotoUrl} alt="Foto actual" className="mt-2 h-32 w-full rounded-md object-cover" />
          )}
        </div>

        <div>
          <ImageInput name="foto_placa" label={fotoPlacaUrl ? 'Reemplazar foto de placa' : 'Foto de placa'} />
          {fotoPlacaUrl && (
            <img src={fotoPlacaUrl} alt="Placa actual" className="mt-2 h-32 w-full rounded-md object-cover" />
          )}
        </div>
      </div>

      <label className="block">
        <span className="brand-label">Notas</span>
        <textarea
          name="notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={4}
          className="brand-field mt-1"
        />
      </label>

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
        {equipo ? 'Guardar cambios' : 'Crear equipo'}
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
        defaultValue={defaultValue ?? ''}
        required={required}
        className="brand-field mt-1"
      />
    </label>
  )
}
