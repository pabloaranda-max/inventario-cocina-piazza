'use client'

import { useState } from 'react'
import { ImageInput } from '@/components/ui/image-input'
import type { EstadoIncidencia } from '@/lib/types'

type Props = {
  incidenciaId: string
  currentEstado: EstadoIncidencia
  canClose: boolean
  requiereEvidencia: boolean
  cambiarEstadoAction: (formData: FormData) => void
  redirectTo?: string
  compact?: boolean
}

export function EstadoFlowPanel({
  incidenciaId,
  currentEstado,
  canClose,
  requiereEvidencia,
  cambiarEstadoAction,
  redirectTo,
  compact = false
}: Props) {
  const [showResolver, setShowResolver] = useState(false)
  const [showCerrar, setShowCerrar] = useState(false)
  const resolvedRedirectTo = redirectTo ?? `/incidencias/${incidenciaId}`

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {currentEstado === 'abierta' ? (
          <QuickEstadoForm
            action={cambiarEstadoAction}
            incidenciaId={incidenciaId}
            estado="en_progreso"
            label="Iniciar trabajo"
            redirectTo={resolvedRedirectTo}
            compact={compact}
          />
        ) : null}
        {currentEstado === 'en_progreso' ? (
          <button
            type="button"
            onClick={() => setShowResolver(true)}
            className={compact ? 'brand-button rounded-md px-3 py-2 text-sm font-medium' : 'brand-button rounded-md px-4 py-2 text-sm font-medium'}
          >
            Marcar resuelta
          </button>
        ) : null}
        {currentEstado === 'resuelta' ? (
          <>
            <QuickEstadoForm
              action={cambiarEstadoAction}
              incidenciaId={incidenciaId}
              estado="en_progreso"
              label="Reabrir"
              subtle
              redirectTo={resolvedRedirectTo}
              compact={compact}
            />
            {canClose ? (
              <button
                type="button"
                onClick={() => setShowCerrar(true)}
                className={compact ? 'brand-button rounded-md px-3 py-2 text-sm font-medium' : 'brand-button rounded-md px-4 py-2 text-sm font-medium'}
              >
                Cerrar incidencia
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {showResolver ? (
        <EstadoModal
          title="Resolver incidencia"
          description={
            requiereEvidencia
              ? 'Esta incidencia requiere foto de evidencia para quedar resuelta. También puedes mandar directo al alta del correctivo.'
              : 'Marca el trabajo como resuelto y, si quieres, genera de inmediato el mantenimiento correctivo.'
          }
          onClose={() => setShowResolver(false)}
        >
          <form action={cambiarEstadoAction} className="space-y-4">
            <input type="hidden" name="estado" value="resuelta" />
            <input type="hidden" name="redirect_to" value={resolvedRedirectTo} />
            <ImageInput
              name="foto"
              label={requiereEvidencia ? 'Foto de evidencia obligatoria' : 'Foto de evidencia (opcional)'}
            />
            <label className="flex items-start gap-2 text-sm text-[color:var(--brand-ink)]">
              <input type="checkbox" name="crear_correctivo" className="mt-1" />
              <span>Generar mantenimiento correctivo al continuar</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowResolver(false)} className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium">
                Cancelar
              </button>
              <button type="submit" className="brand-button rounded-md px-4 py-2 text-sm font-medium">
                Confirmar resuelta
              </button>
            </div>
          </form>
        </EstadoModal>
      ) : null}

      {showCerrar ? (
        <EstadoModal
          title="Cerrar incidencia"
          description="El cierre deja registrada la validación final. Si detectas algo pendiente, reabre la incidencia en lugar de cerrarla."
          onClose={() => setShowCerrar(false)}
        >
          <form action={cambiarEstadoAction} className="space-y-4">
            <input type="hidden" name="estado" value="cerrada" />
            <input type="hidden" name="redirect_to" value={resolvedRedirectTo} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCerrar(false)} className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium">
                Cancelar
              </button>
              <button type="submit" className="brand-button rounded-md px-4 py-2 text-sm font-medium">
                Confirmar cierre
              </button>
            </div>
          </form>
        </EstadoModal>
      ) : null}
    </>
  )
}

function QuickEstadoForm({
  action,
  incidenciaId,
  estado,
  label,
  subtle = false,
  redirectTo,
  compact = false
}: {
  action: (formData: FormData) => void
  incidenciaId: string
  estado: EstadoIncidencia
  label: string
  subtle?: boolean
  redirectTo: string
  compact?: boolean
}) {
  return (
    <form action={action}>
      <input type="hidden" name="estado" value={estado} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <button
        type="submit"
        className={
          subtle
            ? compact
              ? 'brand-button-muted rounded-md px-3 py-2 text-sm font-medium'
              : 'brand-button-muted rounded-md px-4 py-2 text-sm font-medium'
            : compact
              ? 'brand-button rounded-md px-3 py-2 text-sm font-medium'
              : 'brand-button rounded-md px-4 py-2 text-sm font-medium'
        }
      >
        {label}
      </button>
    </form>
  )
}

function EstadoModal({
  title,
  description,
  onClose,
  children
}: {
  title: string
  description: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[color:var(--brand-border)] bg-[color:var(--brand-paper)] p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[color:var(--brand-ink)]">{title}</h3>
            <p className="mt-1 text-sm text-[color:var(--brand-muted)]">{description}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[color:var(--brand-muted)] hover:text-[color:var(--brand-ink)]">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
