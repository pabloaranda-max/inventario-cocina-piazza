import Link from 'next/link'
import { ProveedorForm } from '../proveedor-form'

export default function NuevoProveedorPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/proveedores" className="brand-inline-link text-sm">
          Volver a proveedores
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Nuevo proveedor</h1>
      </div>
      <ProveedorForm />
    </div>
  )
}
