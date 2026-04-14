const messages: Record<string, string> = {
  equipo_creado: 'Equipo creado.',
  equipo_actualizado: 'Equipo actualizado.',
  incidencia_creada: 'Incidencia creada.',
  incidencia_actualizada: 'Incidencia actualizada.',
  mantenimiento_creado: 'Mantenimiento registrado.',
  proveedor_creado: 'Proveedor creado.',
  proveedor_actualizado: 'Proveedor actualizado.',
  incidencia_error: 'No se pudo actualizar la incidencia.'
}

export function FlashMessage({ code }: { code?: string | string[] }) {
  const messageCode = typeof code === 'string' ? code : null
  const message = messageCode ? messages[messageCode] : null
  if (!message) return null
  const isError = messageCode?.endsWith('_error')

  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm font-medium ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {message}
    </div>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null

  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
      {message}
    </div>
  )
}
