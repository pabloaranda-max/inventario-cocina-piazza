async function slackPost(token: string, channel: string, text: string, blocks?: object[]) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ channel, text, ...(blocks ? { blocks } : {}) })
  })
}

export async function postSlackMessage(text: string, blocks?: object[]) {
  const token = process.env.SLACK_MANTENIMIENTO_TOKEN
  const channel = process.env.SLACK_MANTENIMIENTO_CHANNEL
  if (!token || !channel) return
  await slackPost(token, channel, text, blocks)
}

export async function postSlackSeguimiento(text: string, blocks?: object[]) {
  const token = process.env.SLACK_MANTENIMIENTO_TOKEN
  const channel = process.env.SLACK_INCIDENCIAS_SEGUIMIENTO_CHANNEL
  if (!token || !channel) return
  await slackPost(token, channel, text, blocks)
}

export function buildImageBlocks(text: string, fotoUrl: string | null | undefined): object[] | undefined {
  if (!fotoUrl) return undefined
  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    { type: 'image', image_url: fotoUrl, alt_text: 'Evidencia' }
  ]
}
