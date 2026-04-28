import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cambiarEstadoIncidencia, eliminarIncidencia, reportarResolucionSlack } from '../actions'
import { AsignarPanel } from '../asignar-panel'
import { EstadoFlowPanel } from '../estado-flow-panel'
import { FusionarPanel } from '../fusionar-panel'
import { SeguimientoPanel } from '../seguimiento-panel'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Activo, Cotizacion, Incidencia, IncidenciaSeguimiento, Mantenimiento, MapaNivel, MapaZona } from '@/lib/types'
import { formatDate, formatDateTime, formatCurrency, isAdminEmail } from '@/lib/utils'
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function IncidenciaDetallePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ flash?: string }>
}) {
  const { id } = await params
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()

  const [{ data }, { data: mantenimientos }, { data: cotizaciones }, { data: seguimientos }, { data: fusionadas }] = await Promise.all([
    supabase
      .from('incidencias')
      .select('*, activo:activos(id,nombre,area,clase,tipo), equipo:equipos(id,nombre,area), infraestructura:infraestructura(id,nombre,area,tipo)')
      .eq('id', id)
      .single(),
    supabase
      .from('mantenimientos')
      .select('*')
      .eq('incidencia_id', id)
      .order('fecha_realizacion', { ascending: false }),
    supabase
      .from('cotizaciones')
      .select('*, proveedor:proveedores(id,nombre)')
      .eq('incidencia_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('incidencia_seguimientos')
      .select('*')
      .eq('incidencia_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion,reportado_por,fecha_reporte,prioridad')
      .eq('fusionada_en_id', id)
      .order('fecha_reporte', { ascending: true })
  ])
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!data) notFound()

  const incidencia = data as Incidencia
  const pendienteAsignacion = incidencia.estado === 'pendiente_asignacion'

  const [activosData, zonasData, nivelesData, candidatosData] = pendienteAsignacion
    ? await Promise.all([
        supabase.from('activos').select('id,nombre,area,clase,tipo,zona_id').order('nombre', { ascending: true }),
        supabase.from('mapa_zonas').select('id,nombre,area,label,nivel_id').eq('visible', true).order('orden', { ascending: true }),
        supabase.from('mapa_niveles').select('id,nombre,orden').eq('visible', true).order('orden', { ascending: true }),
        supabase.from('incidencias').select('id,ticket_numero,descripcion,reportado_por').in('estado', ['pendiente_asignacion', 'abierta', 'en_progreso']).neq('id', id).is('fusionada_en_id', null).order('fecha_reporte', { ascending: false }).limit(50)
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }]

  const foto = await createSignedUrl(supabase, incidencia.foto_url)
  const destinoNombre =
    incidencia.activo?.nombre ??
    incidencia.equipo?.nombre ??
    incidencia.infraestructura?.nombre ??
    incidencia.zona_nombre
  const destinoArea =
    incidencia.activo?.area ??
    incidencia.equipo?.area ??
    incidencia.infraestructura?.area ??
    incidencia.zona_nombre
  const canCloseIncidencia = isAdminEmail(user?.email)
  const requiereEvidencia = (incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente') && !incidencia.foto_url

  return (
    <div className="space-y-6">
      <FlashMessage code={flash} />

      {pendienteAsignacion && (
        <section className="brand-card rounded-lg border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] p-5 dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(239,169,30,0.16)]">
          <h2 className="text-base font-semibold text-[#8f5a00] dark:text-[#ffd982]">Pendiente de asignación</h2>
          <p className="mt-1 text-sm text-[#8f5a00] dark:text-[#ffd982]">
            Este reporte no está asignado a ningún activo o zona. Asígnalo para que quede activo en el mapa y en el seguimiento.
          </p>
          <div className="mt-4">
            <AsignarPanel
              incidenciaId={incidencia.id}
              activos={(activosData.data ?? []) as Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo' | 'zona_id'>[]}
              zonas={(zonasData.data ?? []) as Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label' | 'nivel_id'>[]}
              niveles={(nivelesData.data ?? []) as Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]}
            />
          </div>
          <FusionarPanel
            incidenciaId={incidencia.id}
            candidatos={(candidatosData?.data ?? []) as { id: string; ticket_numero: string; descripcion: string; reportado_por: string | null }[]}
          />
        </section>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/incidencias" className="brand-inline-link text-sm">
            Volver a incidencias
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Incidencia</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="brand-subtle-chip rounded-md px-2 py-1 text-xs font-medium">
              {incidencia.ticket_numero}
            </span>
            <StatusBadge type="incidencia" value={incidencia.estado} />
            <StatusBadge type="prioridad" value={incidencia.prioridad} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/incidencias/${incidencia.id}/editar`}
            className="brand-button rounded-md px-4 py-2 text-sm font-medium"
          >
            Editar incidencia
          </Link>
          {incidencia.equipo ? (
            <Link
              href={`/mantenimientos/nuevo?equipo=${incidencia.equipo.id}&incidencia=${incidencia.id}`}
              className="rounded-md border border-[rgba(47,62,30,0.16)] bg-[rgba(47,62,30,0.08)] px-4 py-2 text-sm font-medium text-[color:var(--brand-green)] hover:bg-[rgba(47,62,30,0.12)] dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.2)] dark:text-[color:var(--brand-bone)]"
            >
              Mandar a mantenimiento
            </Link>
          ) : null}
          {incidencia.infraestructura ? (
            <Link
              href={`/mantenimientos/nuevo?infraestructura=${incidencia.infraestructura.id}&incidencia=${incidencia.id}`}
              className="rounded-md border border-[rgba(47,62,30,0.16)] bg-[rgba(47,62,30,0.08)] px-4 py-2 text-sm font-medium text-[color:var(--brand-green)] hover:bg-[rgba(47,62,30,0.12)] dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.2)] dark:text-[color:var(--brand-bone)]"
            >
              Mandar a mantenimiento
            </Link>
          ) : null}
          {incidencia.equipo ? (
          <Link
            href={`/equipos/${incidencia.equipo.id}`}
            className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
          >
            Ver equipo
          </Link>
          ) : null}
          {incidencia.infraestructura ? (
            <Link
              href={`/infraestructura/${incidencia.infraestructura.id}`}
              className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
            >
              Ver infraestructura
            </Link>
          ) : null}
          {(incidencia.estado === 'resuelta' || incidencia.estado === 'cerrada') && (
            incidencia.reportado_slack_at ? (
              <span className="rounded-md border border-[rgba(54,197,94,0.3)] bg-[rgba(54,197,94,0.1)] px-4 py-2 text-sm font-medium text-[#1a7a3a] dark:border-[rgba(54,197,94,0.24)] dark:bg-[rgba(54,197,94,0.14)] dark:text-[#7ae8a0]">
                Reportado en Slack
              </span>
            ) : (
              <form action={reportarResolucionSlack.bind(null, incidencia.id)}>
                <button
                  type="submit"
                  className="rounded-md border border-[rgba(54,197,94,0.3)] bg-[rgba(54,197,94,0.1)] px-4 py-2 text-sm font-medium text-[#1a7a3a] hover:bg-[rgba(54,197,94,0.18)] dark:border-[rgba(54,197,94,0.24)] dark:bg-[rgba(54,197,94,0.14)] dark:text-[#7ae8a0]"
                >
                  Compartir en Slack
                </button>
              </form>
            )
          )}
          <form action={eliminarIncidencia.bind(null, incidencia.id)}>
            <ConfirmDeleteButton
              label="Eliminar"
              firstPrompt="Primera confirmación: ¿quieres eliminar esta incidencia?"
              secondPrompt="Segunda confirmación: esta acción no se puede deshacer. ¿Eliminar incidencia?"
            />
          </form>
        </div>
      </div>

      {!pendienteAsignacion ? (
        <section className="brand-card rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[color:var(--brand-ink)]">Acciones de flujo</h2>
              <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                Avanza la incidencia con transiciones válidas. El servidor ya bloquea saltos de estado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <EstadoFlowPanel
                incidenciaId={incidencia.id}
                currentEstado={incidencia.estado}
                canClose={canCloseIncidencia}
                requiereEvidencia={requiereEvidencia}
                cambiarEstadoAction={cambiarEstadoIncidencia.bind(null, incidencia.id)}
              />
            </div>
          </div>
          {requiereEvidencia ? (
            <p className="mt-3 rounded-md border border-[rgba(239,169,30,0.22)] bg-[rgba(239,169,30,0.12)] px-3 py-2 text-sm text-[#8f5a00] dark:border-[rgba(239,169,30,0.24)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)]">
              Esta incidencia es alta/urgente. Debes subir una foto de evidencia antes de marcarla como resuelta.
            </p>
          ) : null}
          {incidencia.estado === 'resuelta' ? (
            <p className="mt-3 text-sm text-[color:var(--brand-muted)]">
              Si no registraste el correctivo al resolver, todavía puedes crear uno desde esta ficha.
            </p>
          ) : null}
          {incidencia.estado === 'resuelta' ? (
            <div className="mt-3">
              <Link
                href={`/mantenimientos/nuevo?tipo=correctivo&incidencia=${incidencia.id}${incidencia.activo_id ? `&activo=${incidencia.activo_id}` : ''}${incidencia.zona_id ? `&zona=${incidencia.zona_id}` : ''}`}
                className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
              >
                Generar mantenimiento correctivo
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="brand-card rounded-lg p-5">
          <h2 className="text-lg font-semibold">Detalle</h2>
          <p className="mt-4 whitespace-pre-line text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{incidencia.descripcion}</p>
          <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <Info label="Destino" value={destinoNombre} />
            <Info label="Clase" value={incidencia.activo?.clase} />
            <Info label="Área o zona" value={destinoArea} />
            <Info label="Reportado por" value={incidencia.reportado_por} />
            <Info label="Fecha y hora" value={formatDateTime(incidencia.fecha_reporte)} />
          </dl>
        </div>

        <div className="brand-card rounded-lg p-3">
          <h2 className="brand-label mb-2">Foto</h2>
          {foto ? (
            <Image
              src={foto}
              alt="Foto de incidencia"
              width={320}
              height={240}
              className="h-60 w-full rounded-md object-cover"
            />
          ) : (
            <div className="brand-hint flex h-60 items-center justify-center rounded-md bg-[rgba(47,62,30,0.06)] dark:bg-[rgba(238,227,202,0.08)]">
              Sin foto
            </div>
          )}
        </div>
      </section>

      {incidencia.estado === 'en_progreso' && (
        <SeguimientoPanel
          incidenciaId={incidencia.id}
          seguimientos={(seguimientos ?? []) as IncidenciaSeguimiento[]}
          usuarioEmail={user?.email}
        />
      )}

      <section className="brand-card rounded-lg p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Cotizaciones</h2>
          <Link
            href={`/cotizaciones/nueva?incidencia=${incidencia.id}${incidencia.activo?.id ? `&proveedor=` : ''}`}
            className="brand-button-muted rounded-md px-3 py-1.5 text-sm font-medium"
          >
            + Agregar cotización
          </Link>
        </div>
        {cotizaciones?.length ? (
          <ul className="mt-4 space-y-3">
            {(cotizaciones as Cotizacion[]).map((c) => (
              <li key={c.id} className="border-b border-[rgba(47,62,30,0.08)] pb-3 last:border-0 dark:border-[rgba(238,227,202,0.08)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/cotizaciones/${c.id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
                      {c.numero}
                    </Link>
                    {c.proveedor && (
                      <span className="brand-hint ml-2 text-sm">{c.proveedor.nombre}</span>
                    )}
                  </div>
                  <StatusBadge type="cotizacion" value={c.estado} />
                </div>
                <p className="brand-hint mt-1 text-sm">
                  {c.monto != null ? formatCurrency(c.monto) : 'Sin monto'} · {formatDate(c.fecha_emision)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="brand-hint mt-4 text-sm">Sin cotizaciones registradas.</p>
        )}
      </section>

      {fusionadas && fusionadas.length > 0 && (
        <section className="brand-card rounded-lg p-5">
          <h2 className="text-lg font-semibold">Reportes fusionados</h2>
          <p className="brand-hint mt-1 text-sm">Incidencias que se consolidaron en este reporte.</p>
          <ul className="mt-4 space-y-3">
            {fusionadas.map((f) => (
              <li key={f.id} className="border-b border-[rgba(47,62,30,0.08)] pb-3 last:border-0 dark:border-[rgba(238,227,202,0.08)]">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/incidencias/${f.id}`} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
                    {f.ticket_numero}
                  </Link>
                  <span className="brand-hint text-xs">fusionada</span>
                </div>
                <p className="brand-hint mt-1 text-sm">
                  {f.reportado_por ? `${f.reportado_por} · ` : ''}{f.descripcion}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="brand-card rounded-lg p-5">
        <h2 className="text-lg font-semibold">Mantenimientos vinculados</h2>
        {mantenimientos?.length ? (
          <ul className="mt-4 space-y-3">
            {(mantenimientos as Mantenimiento[]).map((mantenimiento) => (
              <li key={mantenimiento.id} className="border-b border-[rgba(47,62,30,0.08)] pb-3 last:border-0 dark:border-[rgba(238,227,202,0.08)]">
                <Link
                  href={`/mantenimientos/${mantenimiento.id}`}
                  className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]"
                >
                  {mantenimiento.descripcion}
                </Link>
                <p className="brand-hint mt-1 text-sm">
                  {mantenimiento.tipo} · {formatDate(mantenimiento.fecha_realizacion)}
                  {mantenimiento.realizado_por ? ` · ${mantenimiento.realizado_por}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="brand-hint mt-4 text-sm">Sin mantenimientos vinculados.</p>
        )}
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="brand-hint">{label}</dt>
      <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{value || 'Sin dato'}</dd>
    </div>
  )
}
