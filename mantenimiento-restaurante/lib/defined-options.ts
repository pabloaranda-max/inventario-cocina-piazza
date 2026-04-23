export const equipoAreas = [
  'Cocina caliente',
  'Cocina fría',
  'Barra',
  'Salón',
  'Almacén',
  'Lavado',
  'Cuarto frío',
  'Azotea / exterior',
  'Oficina',
  'Baños'
]

export const equipoCategorias = [
  'Refrigeración',
  'Cocción',
  'Lavado',
  'Extracción / ventilación',
  'Preparación',
  'Café / bebidas',
  'Gas',
  'Eléctrico',
  'Plomería',
  'Climatización',
  'Seguridad',
  'Mobiliario'
]

export const proveedorEspecialidades = [
  'Refrigeración',
  'Gas',
  'Electricidad',
  'Plomería',
  'Extracción / ventilación',
  'Equipos de cocina',
  'Lavado',
  'Climatización',
  'Fumigación',
  'Seguridad',
  'General'
]

export const infraestructuraTipos = [
  'Registro de desagüe',
  'Trampa de grasa',
  'Coladera',
  'Tablero eléctrico',
  'Breaker / circuito',
  'Llave de paso de agua',
  'Válvula de gas',
  'Punto hidráulico',
  'Punto sanitario',
  'Cárcamo / bomba fija',
  'Ducto / extracción',
  'Acceso técnico'
]

export const limpiezaIntervalos: { label: string; dias: number }[] = [
  { label: 'Semanal (7 días)', dias: 7 },
  { label: 'Quincenal (15 días)', dias: 15 },
  { label: 'Mensual (30 días)', dias: 30 },
  { label: 'Bimestral (60 días)', dias: 60 },
  { label: 'Trimestral (90 días)', dias: 90 },
  { label: 'Semestral (180 días)', dias: 180 },
  { label: 'Anual (365 días)', dias: 365 },
]

export const cotizacionEstados: { value: string; label: string }[] = [
  { value: 'pendiente_revision', label: 'Pendiente de revisión' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
]

export const otherPrefix = 'Otro:'

export function parseDefinedValues(value: string | null | undefined) {
  if (!value) return { selected: [] as string[], other: '' }

  return value.split(',').reduce(
    (acc, part) => {
      const trimmed = part.trim()
      if (!trimmed) return acc
      if (trimmed.startsWith(otherPrefix)) {
        acc.other = trimmed.slice(otherPrefix.length).trim()
      } else {
        acc.selected.push(trimmed)
      }
      return acc
    },
    { selected: [] as string[], other: '' }
  )
}

export function buildSingleDefinedValue({
  value,
  other,
  options,
  fieldLabel
}: {
  value: FormDataEntryValue | null
  other: FormDataEntryValue | null
  options: string[]
  fieldLabel: string
}) {
  const selected = typeof value === 'string' ? value.trim() : ''
  const otherValue = typeof other === 'string' ? other.trim() : ''

  if (!selected) return null
  if (selected === otherPrefix) {
    return otherValue ? `${otherPrefix} ${otherValue}` : { error: `Especifica ${fieldLabel}.` }
  }
  if (!options.includes(selected)) return { error: `${fieldLabel} no es válido.` }

  return selected
}

export function buildMultipleDefinedValue({
  values,
  other,
  options,
  fieldLabel
}: {
  values: FormDataEntryValue[]
  other: FormDataEntryValue | null
  options: string[]
  fieldLabel: string
}) {
  const selected = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)

  const hasOther = selected.includes(otherPrefix)
  const fixedValues = selected.filter((value) => value !== otherPrefix)
  const invalidValue = fixedValues.find((value) => !options.includes(value))
  const otherValue = typeof other === 'string' ? other.trim() : ''

  if (invalidValue) return { error: `${fieldLabel} no es válido.` }
  if (hasOther && !otherValue) return { error: `Especifica ${fieldLabel}.` }

  const uniqueValues = Array.from(new Set(fixedValues))
  if (hasOther) uniqueValues.push(`${otherPrefix} ${otherValue}`)

  return uniqueValues.length ? uniqueValues.join(', ') : null
}
