import Link from 'next/link'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/equipos', label: 'Equipos' },
  { href: '/incidencias', label: 'Incidencias' },
  { href: '/mantenimientos', label: 'Mantenimientos' },
  { href: '/proveedores', label: 'Proveedores' }
]

export function Navbar() {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
