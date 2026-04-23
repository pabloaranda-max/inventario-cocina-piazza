import Anthropic from '@anthropic-ai/sdk'

export type DatosPlaca = {
  marca: string | null
  modelo: string | null
  numero_serie: string | null
  specs: string | null  // voltaje, corriente, potencia, etc. como texto libre
}

export async function extraerDatosPlacaDesdeImagen(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<DatosPlaca> {
  const client = new Anthropic()

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `Analiza esta foto de placa de equipo de cocina o restaurante y extrae los datos técnicos.

Responde ÚNICAMENTE con un objeto JSON con esta estructura exacta (usa null si no encuentras el dato):
{
  "marca": "nombre del fabricante o marca",
  "modelo": "número o nombre de modelo",
  "numero_serie": "número de serie",
  "specs": "resto de especificaciones técnicas en una línea: voltaje, corriente, potencia, frecuencia, RPM, refrigerante, etc."
}

No incluyas texto fuera del JSON.`,
          },
        ],
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0]) as DatosPlaca
  } catch {
    return { marca: null, modelo: null, numero_serie: null, specs: null }
  }
}
