type SlackBlock = Record<string, unknown>

async function slackPost(token: string, channel: string, text: string, blocks?: SlackBlock[]) {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      channel,
      text,
      unfurl_links: true,
      unfurl_media: true,
      ...(blocks?.length ? { blocks } : {})
    })
  })
  const body = await res.json().catch(() => null) as { ok: boolean; error?: string } | null
  if (!res.ok || !body?.ok) {
    throw new Error(`Slack post failed: HTTP ${res.status} ${body?.error ?? 'unknown_error'}`)
  }
}

export function buildImageBlocks(text: string, imageUrl: string | null): SlackBlock[] | undefined {
  if (!imageUrl) return undefined

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text }
    },
    {
      type: 'image',
      image_url: imageUrl,
      alt_text: 'Foto de incidencia'
    }
  ]
}

async function postSlackWithOptionalBlocks(token: string, channel: string, text: string, blocks?: SlackBlock[]) {
  try {
    await slackPost(token, channel, text, blocks)
  } catch (error) {
    if (!blocks?.length) throw error

    console.error('Slack post with blocks failed; retrying text-only.', error)
    await slackPost(token, channel, text)
  }
}

export async function postSlackMessage(text: string, blocks?: SlackBlock[]) {
  const token = process.env.SLACK_MANTENIMIENTO_TOKEN
  const channel = process.env.SLACK_MANTENIMIENTO_CHANNEL
  if (!token || !channel) return
  await postSlackWithOptionalBlocks(token, channel, text, blocks)
}

export async function postSlackSeguimiento(text: string, blocks?: SlackBlock[]) {
  const token = process.env.SLACK_MANTENIMIENTO_TOKEN
  const channel = process.env.SLACK_INCIDENCIAS_SEGUIMIENTO_CHANNEL
  if (!token || !channel) return
  await postSlackWithOptionalBlocks(token, channel, text, blocks)
}
