import Link from 'next/link'
import { GlobalSearchForm } from './global-search-form'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/buscar', label: 'Buscar' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/activos', label: 'Activos' },
  { href: '/proveedores', label: 'Proveedores' }
]

export function Navbar() {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      <div className="min-w-[12rem] flex-1 md:flex-none">
        <GlobalSearchForm compact />
      </div>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="brand-nav-link rounded-md px-3 py-2 font-medium"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
