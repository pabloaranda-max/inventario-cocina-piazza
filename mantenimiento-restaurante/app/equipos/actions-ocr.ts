'use server'

import { extraerDatosPlacaDesdeImagen, type DatosPlaca } from '@/lib/ocr'

const EMPTY: DatosPlaca = { marca: null, modelo: null, numero_serie: null, specs: null }

export async function extraerDatosPlaca(formData: FormData): Promise<DatosPlaca> {
  if (!process.env.ANTHROPIC_API_KEY) return EMPTY

  const file = formData.get('imagen')
  if (!(file instanceof File) || file.size === 0) return EMPTY

  try {
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = (file.type === 'image/png' ? 'image/png'
      : file.type === 'image/webp' ? 'image/webp'
      : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp'

    return await extraerDatosPlacaDesdeImagen(base64, mediaType)
  } catch {
    return EMPTY
  }
}
