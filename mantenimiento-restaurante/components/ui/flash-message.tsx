const messages: Record<string, string> = {
  equipo_creado: 'Equipo creado.',
  equipo_actualizado: 'Equipo actualizado.',
  infraestructura_creada: 'Infraestructura creada.',
  infraestructura_actualizada: 'Infraestructura actualizada.',
  incidencia_creada: 'Incidencia creada.',
  incidencia_actualizada: 'Incidencia actualizada.',
  incidencia_eliminada: 'Incidencia eliminada.',
  incidencia_transition_error: 'La transición de estado no está permitida.',
  incidencia_evidencia_error: 'Se requiere foto de evidencia para resolver incidencias alta o urgente.',
  incidencia_admin_error: 'Solo un correo admin configurado puede cerrar incidencias.',
  mantenimiento_creado: 'Mantenimiento registrado.',
  mantenimiento_actualizado: 'Mantenimiento actualizado.',
  mantenimiento_aplicado: 'Mantenimiento aplicado.',
  mantenimiento_eliminado: 'Mantenimiento eliminado.',
  mantenimiento_error: 'No se pudo actualizar el mantenimiento.',
  proveedor_creado: 'Proveedor creado.',
  proveedor_actualizado: 'Proveedor actualizado.',
  incidencia_error: 'No se pudo actualizar la incidencia.',
  cotizacion_creada: 'Cotización registrada.',
  cotizacion_actualizada: 'Cotización actualizada.',
  cotizacion_eliminada: 'Cotización eliminada.',
  cotizacion_error: 'No se pudo actualizar la cotización.',
  activo_actualizado: 'Activo actualizado.'
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
          ? 'border-[rgba(155,30,33,0.18)] bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)] dark:border-[rgba(239,169,30,0.2)] dark:bg-[rgba(155,30,33,0.16)] dark:text-[color:var(--brand-bone)]'
          : 'border-[rgba(47,62,30,0.16)] bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)] dark:border-[rgba(239,169,30,0.16)] dark:bg-[rgba(47,62,30,0.18)] dark:text-[color:var(--brand-bone)]'
      }`}
    >
      {message}
    </div>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null

  return (
    <div className="rounded-md border border-[rgba(155,30,33,0.18)] bg-[rgba(155,30,33,0.08)] px-4 py-3 text-sm font-medium text-[color:var(--brand-wine)] dark:border-[rgba(239,169,30,0.2)] dark:bg-[rgba(155,30,33,0.16)] dark:text-[color:var(--brand-bone)]">
      {message}
    </div>
  )
}
