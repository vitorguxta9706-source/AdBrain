// pages/api/product.js
// Roda no servidor — sem bloqueio CORS, acessa Shopee/Yampi/Shopify diretamente

export default async function handler(req, res) {
  // CORS headers para o frontend
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'URL obrigatória' })

  try {
    const result = await fetchProductData(url)
    res.status(200).json(result)
  } catch (e) {
    console.error('Product fetch error:', e)
    res.status(200).json({ name: '', image: '', price: '', description: '', error: e.message })
  }
}

async function fetchProductData(url) {
  const u = new URL(url)
  const host = u.hostname.replace('www.', '')
  const path = u.pathname

  // ── SHOPEE ──────────────────────────────────────────────────────
  if (host.includes('shopee.')) {
    const m = path.match(/\/(.+)-i\.(\d+)\.(\d+)/)
    if (m) {
      const rawName = decodeURIComponent(m[1].replace(/-/g, ' '))
      const shopId = m[2]
      const itemId = m[3]

      // Chama API pública da Shopee direto do servidor (sem CORS)
      const apiUrl = `https://shopee.com.br/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`
      const apiRes = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://shopee.com.br/',
          'Accept': 'application/json',
          'x-api-source': 'pc',
          'x-shopee-language': 'pt-BR',
          'af-ac-enc-dat': 'null',
        },
        signal: AbortSignal.timeout(10000)
      })

      if (apiRes.ok) {
        const json = await apiRes.json()
        const item = json?.data?.item
        if (item) {
          const imgHash = item.image || item.images?.[0]
          const imageUrl = imgHash ? `https://down-br.img.susercontent.com/file/${imgHash}` : ''
          const price = item.price ? `R$ ${(item.price / 100000).toFixed(2).replace('.', ',')}` : ''
          return {
            name: item.name || rawName,
            image: imageUrl,
            price,
            description: item.description?.substring(0, 200) || '',
            category: 'E-commerce',
            platform: 'shopee'
          }
        }
      }

      // Fallback: scraping da página HTML da Shopee
      return await scrapeOgTags(url, rawName, 'shopee')
    }
  }

  // ── MERCADO LIVRE ────────────────────────────────────────────────
  if (host.includes('mercadolivre') || host.includes('mercadolibre')) {
    const name = path.split('/').pop()?.replace(/-/g, ' ') || ''
    return await scrapeOgTags(url, decodeURIComponent(name), 'mercadolivre')
  }

  // ── YAMPI ────────────────────────────────────────────────────────
  if (host.includes('yampi') || host.includes('loja')) {
    const name = path.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || ''
    return await scrapeOgTags(url, decodeURIComponent(name), 'yampi')
  }

  // ── SHOPIFY / GENÉRICO ───────────────────────────────────────────
  const name = path.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ')?.replace(/\.[^.]+$/, '') || ''
  return await scrapeOgTags(url, decodeURIComponent(name), 'generic')
}

// Scraping de og:image e metadados para qualquer plataforma
async function scrapeOgTags(url, fallbackName, platform) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(12000)
    })

    const html = await res.text()

    // Extrai og:image
    const imgPatterns = [
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
      /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
    ]
    let image = ''
    for (const pat of imgPatterns) {
      const m = html.match(pat)
      if (m?.[1]?.startsWith('http')) { image = m[1]; break }
    }

    // Extrai título
    const titlePatterns = [
      /property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]
    let name = fallbackName
    for (const pat of titlePatterns) {
      const m = html.match(pat)
      if (m?.[1]?.trim()) { name = m[1].trim(); break }
    }

    // Extrai descrição
    const descPatterns = [
      /property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:description["']/i,
      /name=["']description["'][^>]*content=["']([^"']+)["']/i,
    ]
    let description = ''
    for (const pat of descPatterns) {
      const m = html.match(pat)
      if (m?.[1]?.trim()) { description = m[1].trim().substring(0, 200); break }
    }

    // Extrai preço
    const pricePatterns = [
      /class=["'][^"']*price[^"']*["'][^>]*>[\s\S]*?R\$\s*([\d.,]+)/i,
      /["']price["'][^>]*>[\s\S]*?R\$\s*([\d.,]+)/i,
      /R\$\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/,
    ]
    let price = ''
    for (const pat of pricePatterns) {
      const m = html.match(pat)
      if (m?.[1]) { price = `R$ ${m[1]}`; break }
    }

    return { name, image, price, description, platform, category: getCategoryFromName(name) }
  } catch (e) {
    return { name: fallbackName, image: '', price: '', description: '', platform, category: 'E-commerce' }
  }
}

function getCategoryFromName(name) {
  const n = name.toLowerCase()
  if (n.match(/tênis|sapato|calçado|sandália|bota/)) return 'Moda'
  if (n.match(/camiseta|roupa|vestido|calça|blusa|jaqueta/)) return 'Moda'
  if (n.match(/celular|iphone|samsung|smartphone|fone|headphone/)) return 'Eletrônicos'
  if (n.match(/jogo de jantar|prato|copo|panela|xícara|cerâmica|porcelana/)) return 'Casa e Decoração'
  if (n.match(/suplemento|whey|creatina|vitamina|proteína/)) return 'Saúde'
  if (n.match(/maquiagem|batom|creme|perfume|shampoo/)) return 'Beleza'
  if (n.match(/cadeira|mesa|sofá|armário|estante/)) return 'Móveis'
  if (n.match(/curso|ebook|treinamento|mentoria/)) return 'Produto Digital'
  return 'E-commerce'
}
