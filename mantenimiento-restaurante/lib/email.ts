const RESEND_API_KEY = process.env.RESEND_API_KEY
const GMAIL_RELAY_URL = process.env.GMAIL_RELAY_URL ?? 'https://script.google.com/macros/s/AKfycbwlzsQFhwVcC3KyGvFvdp-k4ae6tIDDZEA2cnkuEB4qUqWyMpjLjBx2lpm1p48oz1bO/exec'
const NOTIFY_TO = process.env.NOTIFY_EMAIL ?? 'pablo.aranda@piazza-pasticcio.com'

async function sendEmail(to: string, subject: string, body: string) {
  await fetch(GMAIL_RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, body })
  })
}

async function sendEmailResend(to: string[], subject: string, text: string) {
  if (!RESEND_API_KEY) return
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Mantto Piazza <onboarding@resend.dev>',
      to,
      subject,
      text
    })
  })
}

export async function notificarNuevoReporte({
  ticket,
  descripcion,
  prioridad,
  reportado_por,
  emailReportador
}: {
  ticket: string
  descripcion: string
  prioridad: string
  reportado_por: string
  emailReportador?: string
}) {
  const cuerpo = [
    `Ticket: ${ticket}`,
    `Prioridad: ${prioridad}`,
    `Reportado por: ${reportado_por}`,
    ``,
    descripcion
  ].join('\n')

  await sendEmail(NOTIFY_TO, `Nuevo reporte ${ticket} · ${prioridad}`, cuerpo)

  if (emailReportador) {
    await sendEmail(
      emailReportador,
      `Tu reporte fue recibido · ${ticket}`,
      [
        `Hola ${reportado_por},`,
        ``,
        `Tu reporte fue recibido. El equipo de mantenimiento lo revisará pronto.`,
        ``,
        cuerpo
      ].join('\n')
    )
  }
}
