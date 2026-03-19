// pages/api/image-proxy.js
// Faz proxy das imagens do produto para evitar CORS no canvas

export default async function handler(req, res) {
  const { url } = req.query
  if (!url) return res.status(400).end()

  try {
    const imgRes = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://shopee.com.br/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000)
    })

    if (!imgRes.ok) return res.status(404).end()

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg'
    const buffer = await imgRes.arrayBuffer()

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).send(Buffer.from(buffer))
  } catch (e) {
    res.status(500).end()
  }
}

export const config = {
  api: { responseLimit: '10mb' }
}
