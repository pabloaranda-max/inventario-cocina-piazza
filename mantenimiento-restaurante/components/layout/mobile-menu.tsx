'use client'

import { useState } from 'react'
import Link from 'next/link'
import { logout } from '@/app/login/actions'
import { GlobalSearchForm } from './global-search-form'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/buscar', label: 'Buscar' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/activos', label: 'Activos' },
  { href: '/proveedores', label: 'Proveedores' }
]

export function MobileMenu() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menú"
        className="brand-nav-link rounded-md border border-transparent p-2"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div
            className="brand-shell absolute right-0 top-[65px] w-full border-b px-4 py-3 dark:border-[rgba(101,127,68,0.2)] dark:bg-[rgba(31,43,23,0.94)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <GlobalSearchForm />
            </div>
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="brand-nav-link rounded-md px-3 py-2.5 text-sm font-medium"
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 border-t border-[color:var(--brand-border)]" />
              <form action={logout}>
                <button
                  type="submit"
                  className="brand-nav-link w-full rounded-md px-3 py-2.5 text-left text-sm font-medium"
                >
                  Salir
                </button>
              </form>
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
