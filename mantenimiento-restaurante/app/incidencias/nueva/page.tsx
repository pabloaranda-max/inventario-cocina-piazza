import Link from 'next/link'
import { ReporteRapidoForm } from '../incidencia-form'

export default function NuevaIncidenciaPage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <Link href="/incidencias" className="brand-inline-link text-sm">
          Volver a incidencias
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Reportar incidencia</h1>
        <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
          Describe el problema. La asignación y seguimiento se hace después.
        </p>
      </div>
      <ReporteRapidoForm />
    </div>
  )
}
