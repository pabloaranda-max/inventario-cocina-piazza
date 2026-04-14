import Link from 'next/link'
import { ProveedorForm } from '../proveedor-form'

export default function NuevoProveedorPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/proveedores" className="text-sm text-slate-600 hover:text-slate-950">
          Volver a proveedores
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Nuevo proveedor</h1>
      </div>
      <ProveedorForm />
    </div>
  )
}
