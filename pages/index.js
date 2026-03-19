import { useState, useRef } from 'react'
import Head from 'next/head'

// ── TEMAS POR TIPO DE ANÚNCIO ──────────────────────────────────────
const THEMES = {
  'Urgência':    { bg: ['#1a0505','#7f1d1d','#dc2626'], accent: '#ff4444' },
  'Social Proof':{ bg: ['#0a1628','#1e3a5f','#1d4ed8'], accent: '#60a5fa' },
  'Benefício':   { bg: ['#0a1a0a','#14532d','#15803d'], accent: '#4ade80' },
  'Curiosidade': { bg: ['#1a0a2e','#4c1d95','#7c3aed'], accent: '#a78bfa' },
  'Oferta':      { bg: ['#1a1000','#92400e','#d97706'], accent: '#fbbf24' },
  'default':     { bg: ['#111','#222','#333'],           accent: '#ffffff' },
}

export default function Home() {
  const [screen, setScreen] = useState('setup') // setup | app
  const [cfg, setCfg] = useState({ anthropicKey: '', hfToken: '' })
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [product, setProduct] = useState(null)
  const [ads, setAds] = useState([])
  const [score, setScore] = useState(null)
  const [adImages, setAdImages] = useState({})
  const [toast, setToast] = useState(null)
  const [activeTab, setActiveTab] = useState('todos')
  const canvasRef = useRef(null)

  // ── INIT: carrega config salva ─────────────────────────────────
  useState(() => {
    try {
      const saved = localStorage.getItem('adbrain_cfg')
      if (saved) {
        const c = JSON.parse(saved)
        setCfg(c)
        if (c.anthropicKey) setScreen('app')
      }
    } catch(e) {}
  })

  function showToast(msg, color = '#22c55e') {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 3500)
  }

  function saveConfig(ak, hf) {
    if (!ak.trim()) { showToast('⚠️ Cole a Anthropic API Key', '#ff8c42'); return }
    const c = { anthropicKey: ak.trim(), hfToken: hf.trim() }
    setCfg(c)
    localStorage.setItem('adbrain_cfg', JSON.stringify(c))
    setScreen('app')
    showToast('✅ Configurado!')
  }

  // ── GENERATION ────────────────────────────────────────────────
  async function startGen(publico, objetivo, plat) {
    if (!url.trim()) { showToast('⚠️ Cole o link do produto!', '#ff8c42'); return }
    setLoading(true)
    setStep(0)
    setAds([])
    setAdImages({})

    try {
      // Step 1: busca dados reais do produto via API route (server-side, sem CORS!)
      setStep(1)
      let productData = { name: '', image: '', price: '', description: '', category: 'E-commerce' }
      try {
        const pRes = await fetch(`/api/product?url=${encodeURIComponent(url)}`)
        if (pRes.ok) productData = await pRes.json()
      } catch(e) { console.warn('Product API failed:', e) }

      // Extrai nome da URL como fallback
      if (!productData.name) productData.name = extractNameFromUrl(url)

      // Step 2: gera copy com Claude
      setStep(2)
      let generatedAds = [], generatedScore = null, generatedProduct = null
      if (cfg.anthropicKey) {
        const result = await generateWithClaude(productData, publico, objetivo, plat)
        generatedAds = result.ads
        generatedScore = result.score
        generatedProduct = result.product
      } else {
        const demo = demoData(productData.name)
        generatedAds = demo.ads
        generatedScore = demo.score
        generatedProduct = demo.product
      }

      // Merge com dados reais da página
      generatedProduct.image = productData.image || ''
      generatedProduct.realName = productData.name || generatedProduct.name

      setProduct(generatedProduct)
      setScore(generatedScore)
      setAds(generatedAds)

      // Step 3: gera imagens dos criativos
      setStep(3)
      generateAllImages(generatedAds, generatedProduct, productData.image)

      // Step 4: score
      setStep(4)

    } catch(e) {
      console.error(e)
      showToast('Erro ao gerar. Tente novamente.', '#ff3c5c')
    } finally {
      setLoading(false)
    }
  }

  // ── CLAUDE API ────────────────────────────────────────────────
  async function generateWithClaude(productData, publico, objetivo, plat) {
    const prompt = `Você é especialista em marketing digital e copywriting para e-commerce brasileiro.

PRODUTO REAL:
- Nome: "${productData.name}"
- Categoria: ${productData.category}
- Descrição: ${productData.description || 'não disponível'}
- Preço: ${productData.price || 'não informado'}
- Público: ${publico} | Objetivo: ${objetivo} | Plataforma: ${plat}

Crie 5 anúncios específicos para este produto. Use o nome real nas headlines.

Retorne APENAS JSON:
{
  "product":{"name":"nome real","category":"categoria","price":"preço","emoji":"emoji do produto","description":"benefício principal"},
  "score":{"overall":78,"appeal":82,"urgency":75,"trust":71,"price":85,"competition":62},
  "ads":[
    {"type":"Urgência","gradient":"linear-gradient(135deg,#1a0505,#dc2626)","headline":"headline real max 8 palavras","copy":"copy 2-3 frases com gatilho","cta":"GARANTIR AGORA","winner":false,"badge":"ÚLTIMAS UNIDADES","tagline":"Só hoje"},
    {"type":"Social Proof","gradient":"linear-gradient(135deg,#0a1628,#1d4ed8)","headline":"headline social proof","copy":"copy prova social","cta":"QUERO O MEU","winner":false,"badge":"+5.000 VENDIDOS","tagline":"Aprovado"},
    {"type":"Benefício","gradient":"linear-gradient(135deg,#061a10,#15803d)","headline":"headline benefício","copy":"copy benefício real","cta":"APROVEITAR AGORA","winner":false,"badge":"GARANTIA 30 DIAS","tagline":"Sem risco"},
    {"type":"Curiosidade","gradient":"linear-gradient(135deg,#1a0a2e,#7c3aed)","headline":"headline curiosidade","copy":"copy curiosidade","cta":"DESCOBRIR AGORA","winner":false,"badge":"EXCLUSIVO","tagline":"Descubra"},
    {"type":"Oferta","gradient":"linear-gradient(135deg,#1a1000,#d97706)","headline":"headline oferta","copy":"copy oferta urgente","cta":"PEGAR DESCONTO","winner":true,"badge":"FRETE GRÁTIS","tagline":"Só hoje"}
  ]
}
Retorne SOMENTE JSON.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    })
    if (!res.ok) throw new Error('Claude API error')
    const data = await res.json()
    const text = data.content.map(i => i.text || '').join('')
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  }

  // ── GERA IMAGENS VIA CANVAS + IMAGEM REAL ─────────────────────
  async function generateAllImages(adsList, prod, realImageUrl) {
    // Carrega imagem real do produto via proxy do servidor
    let prodImg = null
    if (realImageUrl) {
      try {
        prodImg = await loadImage(`/api/image-proxy?url=${encodeURIComponent(realImageUrl)}`)
      } catch(e) { console.warn('Could not load product image:', e) }
    }

    // Gera criativo para cada anúncio em paralelo
    const promises = adsList.map((ad, i) =>
      renderCreative(ad, prod, prodImg).then(dataUrl => {
        setAdImages(prev => ({ ...prev, [i]: dataUrl }))
      })
    )
    await Promise.all(promises)
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  // ── CANVAS: compõe criativo final ─────────────────────────────
  async function renderCreative(ad, prod, prodImg) {
    const W = 800, H = 600
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    const th = THEMES[ad.type] || THEMES.default
    const accent = th.accent

    // Fundo gradiente temático
    const g = ctx.createLinearGradient(0, 0, W, H)
    th.bg.forEach((c, i, a) => g.addColorStop(i / (a.length - 1 || 1), c))
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    // Círculos decorativos
    ctx.globalAlpha = 0.12; ctx.fillStyle = accent
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.15, 200, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(W * 0.1, H * 0.85, 150, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    // Linha topo colorida
    const lg = ctx.createLinearGradient(0, 0, W, 0)
    lg.addColorStop(0, 'transparent'); lg.addColorStop(0.5, accent); lg.addColorStop(1, 'transparent')
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, 5)

    // ── IMAGEM REAL DO PRODUTO (grande, centralizada) ──────────
    if (prodImg) {
      const iSize = 230, iX = W / 2 - iSize / 2, iY = 22
      // Sombra colorida
      ctx.shadowColor = accent; ctx.shadowBlur = 60
      ctx.save()
      roundRect(ctx, iX, iY, iSize, iSize, 22)
      ctx.clip()
      ctx.drawImage(prodImg, iX, iY, iSize, iSize)
      ctx.restore()
      ctx.shadowBlur = 0
      // Borda brilhante
      ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6
      roundRect(ctx, iX, iY, iSize, iSize, 22); ctx.stroke()
      ctx.globalAlpha = 1
    } else {
      // Emoji do produto como fallback
      ctx.font = '120px serif'; ctx.textAlign = 'center'
      ctx.shadowColor = accent; ctx.shadowBlur = 50
      ctx.fillText(prod?.emoji || '🛍️', W / 2, 190)
      ctx.shadowBlur = 0
    }

    // Nome do produto
    const pName = (prod?.name || '').toUpperCase().substring(0, 40)
    ctx.font = 'bold 14px Arial'; ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.textAlign = 'center'; ctx.shadowBlur = 0
    ctx.fillText(pName, W / 2, prodImg ? 275 : 232)

    // Badge
    let curY = prodImg ? 292 : 250
    if (ad.badge) {
      ctx.font = 'bold 12px Arial'
      const bw = ctx.measureText(ad.badge).width + 26, bh = 26
      ctx.fillStyle = accent; ctx.globalAlpha = 0.95
      roundRect(ctx, W / 2 - bw / 2, curY, bw, bh, 13); ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = isLight(accent) ? '#000' : '#fff'
      ctx.textAlign = 'center'; ctx.fillText(ad.badge, W / 2, curY + 17)
      curY += 36
    }

    // Tagline
    if (ad.tagline) {
      ctx.font = 'bold 16px Arial'; ctx.fillStyle = accent
      ctx.globalAlpha = 0.9; ctx.textAlign = 'center'
      ctx.fillText(ad.tagline.toUpperCase(), W / 2, curY + 10)
      ctx.globalAlpha = 1; curY += 30
    }

    // Headline
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 8
    wrapText(ctx, ad.headline.replace(/[⚡🔥✅🤫🌟🛍️🔮]/gu, '').trim(), W / 2, curY + 18, W - 80, 32, 'bold 24px Arial')
    ctx.shadowBlur = 0

    // Separador
    ctx.fillStyle = accent; ctx.globalAlpha = 0.3
    ctx.fillRect(W / 2 - 45, curY + 72, 90, 2)
    ctx.globalAlpha = 1

    // Botão CTA
    ctx.font = 'bold 15px Arial'
    const cw = Math.min(ctx.measureText(ad.cta).width + 80, 290)
    const ch = 46, cx = W / 2 - cw / 2, cy = curY + 90
    ctx.shadowColor = accent; ctx.shadowBlur = 25
    ctx.fillStyle = accent
    roundRect(ctx, cx, cy, cw, ch, 23); ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = isLight(accent) ? '#000' : '#fff'
    ctx.fillText(ad.cta, W / 2, cy + 30)

    // Linha rodapé
    ctx.fillStyle = lg; ctx.fillRect(0, H - 4, W, 4)

    return canvas.toDataURL('image/jpeg', 0.93)
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  function wrapText(ctx, text, x, y, mw, lh, font) {
    ctx.font = font; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
    const words = text.split(' '); let line = '', cy = y
    for (const w of words) {
      const t = line ? line + ' ' + w : w
      if (ctx.measureText(t).width > mw && line) { ctx.fillText(line, x, cy); line = w; cy += lh }
      else line = t
    }
    if (line) ctx.fillText(line, x, cy)
  }

  function isLight(hex) {
    const c = (hex || '#888').replace('#', '').padEnd(6, '0')
    return (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000 > 128
  }

  function extractNameFromUrl(url) {
    try {
      const u = new URL(url)
      const m = u.pathname.match(/\/(.+)-i\.\d+\.\d+/)
      if (m) return decodeURIComponent(m[1].replace(/-/g, ' '))
      return u.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || ''
    } catch(e) { return '' }
  }

  function demoData(name) {
    return {
      product: { name: name || 'Produto Demo', category: 'E-commerce', price: 'R$ 97', emoji: '🛍️', description: 'Produto de qualidade' },
      score: { overall: 76, appeal: 80, urgency: 74, trust: 68, price: 82, competition: 58 },
      ads: [
        { type: 'Urgência', gradient: 'linear-gradient(135deg,#1a0505,#dc2626)', headline: `⚡ ${name} — últimas unidades!`, copy: 'Não perca essa chance. Estoque limitado.', cta: 'GARANTIR AGORA', winner: true, badge: 'ÚLTIMAS UNIDADES', tagline: 'Só hoje' },
        { type: 'Social Proof', gradient: 'linear-gradient(135deg,#0a1628,#1d4ed8)', headline: `🌟 +5.000 clientes amam ${name}`, copy: 'Qualidade aprovada por milhares.', cta: 'QUERO O MEU', winner: false, badge: '+5.000 VENDIDOS', tagline: 'Aprovado' },
        { type: 'Benefício', gradient: 'linear-gradient(135deg,#061a10,#15803d)', headline: `✅ ${name} com garantia total`, copy: 'Zero risco. 30 dias de garantia.', cta: 'APROVEITAR AGORA', winner: false, badge: 'GARANTIA 30 DIAS', tagline: 'Sem risco' },
        { type: 'Curiosidade', gradient: 'linear-gradient(135deg,#1a0a2e,#7c3aed)', headline: '🤫 O segredo que ninguém te contou', copy: 'Descubra por que profissionais escolhem este produto.', cta: 'DESCOBRIR AGORA', winner: false, badge: 'EXCLUSIVO', tagline: 'Descubra' },
        { type: 'Oferta', gradient: 'linear-gradient(135deg,#1a1000,#d97706)', headline: `🔥 ${name} com 50% OFF hoje`, copy: 'Frete grátis + brinde surpresa.', cta: 'PEGAR DESCONTO', winner: false, badge: 'FRETE GRÁTIS', tagline: 'Só hoje' },
      ]
    }
  }

  function copyAd(ad) {
    navigator.clipboard.writeText(`${ad.headline}\n\n${ad.copy}\n\n👉 ${ad.cta}`)
      .then(() => showToast('✅ Copy copiada!'))
  }

  function downloadImg(i) {
    const src = adImages[i]
    if (!src) { showToast('⏳ Aguarde...', '#ff8c42'); return }
    const a = document.createElement('a')
    a.href = src; a.download = `adbrain-ad-${i + 1}.jpg`; a.click()
    showToast('⬇️ Baixado!', '#7c3aed')
  }

  function exportAll() {
    const txt = ads.map((ad, i) => `=== ANÚNCIO ${i + 1} — ${ad.type} ${ad.winner ? '⭐' : ''} ===\nHeadline: ${ad.headline}\nCopy: ${ad.copy}\nCTA: ${ad.cta}\n`).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }))
    a.download = 'adbrain-anuncios.txt'; a.click()
    showToast('📦 Exportado!')
  }

  const filteredAds = activeTab === 'todos' ? ads : activeTab === 'copy' ? ads.slice(0, 3) : ads.slice(2)

  // ── SETUP SCREEN ──────────────────────────────────────────────
  if (screen === 'setup') {
    return (
      <div style={s.page}>
        <Head><title>AdBrain — Setup</title></Head>
        <div style={s.setupWrap}>
          <div style={s.logo}>Ad<span style={{ color: '#ff3c5c' }}>Brain</span></div>
          <div style={s.card}>
            <h2 style={s.cardTitle}>⚙️ Configuração Inicial</h2>
            <p style={s.cardSub}>Cole suas chaves abaixo. Ficam salvas <strong>só no seu navegador</strong>.</p>
            <label style={s.label}>ANTHROPIC API KEY</label>
            <input id="ak" type="password" placeholder="sk-ant-..." style={s.input} />
            <div style={s.hint}>Obtenha em: <a href="https://console.anthropic.com" target="_blank" style={s.link}>console.anthropic.com</a></div>
            <div style={{ height: 14 }} />
            <label style={s.label}>HUGGING FACE TOKEN <span style={{ opacity: .5, fontWeight: 400 }}>(opcional — para imagens IA)</span></label>
            <input id="hf" type="password" placeholder="hf_..." style={s.input} />
            <div style={s.hint}>Gratuito em: <a href="https://huggingface.co/settings/tokens" target="_blank" style={s.link}>huggingface.co → Settings → Tokens → New token (Read + Inference)</a></div>
            <button style={s.btnMain} onClick={() => saveConfig(document.getElementById('ak').value, document.getElementById('hf').value || '')}>
              💾 Salvar e Começar
            </button>
          </div>
        </div>
        {toast && <div style={{ ...s.toast, borderColor: toast.color, color: toast.color }}>{toast.msg}</div>}
      </div>
    )
  }

  // ── APP SCREEN ────────────────────────────────────────────────
  const [publico, setPublico] = useState('🎯 Público: Geral')
  const [objetivo, setObjetivo] = useState('💰 Objetivo: Vendas')
  const [plat, setPlat] = useState('📱 Meta Ads')

  return (
    <div style={s.page}>
      <Head><title>AdBrain — Anúncios que Vendem</title></Head>

      {/* NAV */}
      <nav style={s.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={s.logo}>Ad<span style={{ color: '#ff3c5c' }}>Brain</span></div>
          <span style={s.navBadge}>BETA</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={s.btnSm} onClick={() => setScreen('setup')}>⚙️ Config</button>
        </div>
      </nav>

      {/* HERO */}
      <div style={s.hero}>
        <div style={s.pill}><span style={s.dot} /> IA ativa · Gerando anúncios agora</div>
        <h1 style={s.h1}>Anúncios que<br /><em style={{ fontStyle: 'normal', color: '#ff3c5c' }}>realmente vendem</em></h1>
        <p style={s.heroSub}>Cole o link do produto. Em segundos você tem copy, imagem real e score de potencial.</p>
      </div>

      {/* APP CARD */}
      <div style={s.appWrap}>
        <div style={s.appCard}>

          {/* INPUT */}
          <div style={s.inputSec}>
            <div style={s.inputLabel}>⚡ LINK DO PRODUTO</div>
            <div style={s.urlRow}>
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://shopee.com.br/produto... Yampi, Shopify, etc." style={s.urlInput} />
              <button style={s.btnGen} disabled={loading} onClick={() => startGen(publico, objetivo, plat)}>
                {loading ? '⏳ Gerando...' : '🧠 Gerar Anúncios'}
              </button>
            </div>
            <div style={s.metaRow}>
              <select value={publico} onChange={e => setPublico(e.target.value)} style={s.sel}>
                <option>🎯 Público: Geral</option><option>🛍️ Dropshipping</option><option>📦 E-commerce</option><option>🤝 Afiliados</option>
              </select>
              <select value={objetivo} onChange={e => setObjetivo(e.target.value)} style={s.sel}>
                <option>💰 Objetivo: Vendas</option><option>👁️ Alcance</option><option>🖱️ Tráfego</option>
              </select>
              <select value={plat} onChange={e => setPlat(e.target.value)} style={s.sel}>
                <option>📱 Meta Ads</option><option>🎵 TikTok Ads</option><option>🔍 Google Ads</option>
              </select>
            </div>
          </div>

          {/* LOADING */}
          {loading && (
            <div style={s.loadingSec}>
              <div style={s.spinner} />
              <p style={{ marginTop: 18, color: '#6b6b80', fontSize: 14 }}>Sua IA está trabalhando...</p>
              <div style={s.steps}>
                {['🔍 Buscando dados e imagem do produto', '✍️ Criando copies persuasivas', '🎨 Montando criativos com imagem real', '📊 Calculando score de potencial'].map((txt, i) => (
                  <div key={i} style={{ ...s.step, ...(step === i + 1 ? s.stepActive : step > i + 1 ? s.stepDone : {}) }}>
                    {step > i + 1 ? '✅' : txt}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RESULTS */}
          {!loading && ads.length > 0 && (
            <div style={s.resultsSec}>
              <div style={s.resultsHdr}>
                <div style={s.resultsTitle}>5 Anúncios Gerados ✅</div>
                {score && (
                  <div style={s.scoreBadge}>
                    <div style={s.scoreNum}>{score.overall}%</div>
                    <div style={s.scoreLbl}>Score de<br />potencial</div>
                  </div>
                )}
              </div>

              {product && (
                <div style={s.prodInfo}>
                  <div style={s.prodThumb}>
                    {product.image
                      ? <img src={`/api/image-proxy?url=${encodeURIComponent(product.image)}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} onError={e => e.target.style.display = 'none'} />
                      : product.emoji}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{product.name}</div>
                    <div style={{ fontSize: 12, color: '#6b6b80' }}>{product.category} · {product.price} · {product.description}</div>
                  </div>
                </div>
              )}

              {/* TABS */}
              <div style={s.tabs}>
                {['todos', 'copy', 'criativo'].map(t => (
                  <button key={t} style={{ ...s.tab, ...(activeTab === t ? s.tabActive : {}) }} onClick={() => setActiveTab(t)}>
                    {t === 'todos' ? 'Todos' : t === 'copy' ? '📝 Copy' : '🎨 Criativo'}
                  </button>
                ))}
              </div>

              {/* ADS GRID */}
              <div style={s.adsGrid}>
                {filteredAds.map((ad, i) => {
                  const ri = ads.indexOf(ad)
                  return (
                    <div key={ri} style={{ ...s.adCard, ...(ad.winner ? s.adCardWinner : {}) }}>
                      {ad.winner && <div style={s.winnerBadge}>⭐ VENCEDOR</div>}
                      <div style={s.adImgWrap}>
                        {adImages[ri]
                          ? <img src={adImages[ri]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={s.imgLoading}><div style={s.imgSpinner} /><p style={{ fontSize: 11, color: '#6b6b80', marginTop: 8 }}>Montando criativo...</p></div>
                        }
                      </div>
                      <div style={s.adBody}>
                        <div style={s.adType}>{ad.type}</div>
                        <div style={s.adHl}>{ad.headline}</div>
                        <div style={s.adCopy}>{ad.copy}</div>
                        <div style={s.adCta}>{ad.cta}</div>
                      </div>
                      <div style={s.adActions}>
                        <button style={s.btnAction} onClick={() => copyAd(ad)}>📋 Copiar copy</button>
                        <button style={s.btnAction} onClick={() => downloadImg(ri)}>⬇️ Baixar</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* SCORE */}
              {score && (
                <div style={s.scoreSec}>
                  <div style={s.scoreTit}>📊 Análise de Potencial de Venda</div>
                  <div style={s.scoreGrid}>
                    {Object.entries({ appeal: 'Apelo Visual', urgency: 'Urgência', trust: 'Confiança', price: 'Preço', competition: 'Concorrência' }).map(([k, l]) => (
                      <div key={k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b6b80', marginBottom: 5 }}>
                          <span>{l}</span><span style={{ color: '#f0f0f8' }}>{score[k]}%</span>
                        </div>
                        <div style={s.barBg}>
                          <div style={{ ...s.barFill, width: `${score[k]}%`, background: score[k] >= 75 ? 'linear-gradient(90deg,#22c55e,#86efac)' : score[k] >= 55 ? 'linear-gradient(90deg,#ff8c42,#fbbf24)' : 'linear-gradient(90deg,#7c3aed,#ff3c5c)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={s.regenRow}>
                <button style={s.btnRegen} onClick={() => startGen(publico, objetivo, plat)}>🔄 Novas variações</button>
                <button style={s.btnRegen} onClick={exportAll}>📦 Exportar tudo</button>
              </div>
            </div>
          )}

          {/* STATS */}
          <div style={s.statsRow}>
            {[['12.4k','Anúncios gerados'],['R$2.1M','Vendas atribuídas'],['4.8x','ROAS médio']].map(([n,d]) => (
              <div key={d} style={s.stat}><div style={s.statN}>{n}</div><div style={s.statD}>{d}</div></div>
            ))}
          </div>
        </div>
      </div>

      {toast && <div style={{ ...s.toast, borderColor: toast.color, color: toast.color }}>{toast.msg}</div>}
    </div>
  )
}

// ── STYLES ────────────────────────────────────────────────────────
const s = {
  page: { background: '#060608', minHeight: '100vh', color: '#f0f0f8', fontFamily: "'DM Sans', sans-serif", overflowX: 'hidden' },
  setupWrap: { maxWidth: 520, margin: '0 auto', padding: '60px 24px', textAlign: 'center' },
  logo: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 32 },
  card: { background: '#0f0f14', border: '1px solid #22222e', borderRadius: 20, padding: 32, textAlign: 'left' },
  cardTitle: { fontFamily: "'Syne', sans-serif", fontSize: 18, marginBottom: 8 },
  cardSub: { fontSize: 13, color: '#6b6b80', marginBottom: 20, lineHeight: 1.6 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b6b80', display: 'block', marginBottom: 6 },
  input: { width: '100%', background: '#060608', border: '1px solid #22222e', borderRadius: 10, padding: '12px 16px', color: '#f0f0f8', fontFamily: 'DM Sans, sans-serif', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  hint: { fontSize: 11, color: '#6b6b80', marginTop: 5 },
  link: { color: '#ff3c5c', textDecoration: 'none' },
  btnMain: { width: '100%', background: 'linear-gradient(135deg,#ff3c5c,#ff8c42)', border: 'none', color: '#fff', padding: '14px', borderRadius: 10, fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 16, boxShadow: '0 4px 24px rgba(255,60,92,.3)' },
  nav: { position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 40px', background: 'rgba(6,6,8,.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #22222e' },
  navBadge: { background: '#ff3c5c', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: 1 },
  btnSm: { background: 'transparent', border: '1px solid #22222e', color: '#6b6b80', padding: '7px 16px', borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' },
  hero: { position: 'relative', textAlign: 'center', padding: '70px 40px 40px', maxWidth: 860, margin: '0 auto' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#16161e', border: '1px solid #22222e', padding: '6px 16px', borderRadius: 100, fontSize: 12, color: '#6b6b80', marginBottom: 24 },
  dot: { width: 6, height: 6, background: '#22c55e', borderRadius: '50%' },
  h1: { fontFamily: 'Syne, sans-serif', fontSize: 'clamp(34px,6vw,60px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginBottom: 16 },
  heroSub: { fontSize: 16, color: '#6b6b80', maxWidth: 520, margin: '0 auto 40px', lineHeight: 1.7, fontWeight: 300 },
  appWrap: { maxWidth: 900, margin: '0 auto 80px', padding: '0 24px' },
  appCard: { background: '#0f0f14', border: '1px solid #22222e', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)' },
  inputSec: { padding: '28px 32px', borderBottom: '1px solid #22222e', background: 'linear-gradient(135deg,#0f0f14,#16161e)' },
  inputLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#6b6b80', marginBottom: 10 },
  urlRow: { display: 'flex', gap: 12 },
  urlInput: { flex: 1, background: '#060608', border: '1px solid #22222e', borderRadius: 10, padding: '13px 18px', color: '#f0f0f8', fontFamily: 'DM Sans, sans-serif', fontSize: 15, outline: 'none' },
  btnGen: { background: 'linear-gradient(135deg,#ff3c5c,#ff8c42)', border: 'none', color: '#fff', padding: '13px 26px', borderRadius: 10, fontFamily: 'Syne, sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(255,60,92,.3)' },
  metaRow: { display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  sel: { background: '#060608', border: '1px solid #22222e', borderRadius: 8, padding: '7px 12px', color: '#6b6b80', fontFamily: 'DM Sans, sans-serif', fontSize: 13, outline: 'none', cursor: 'pointer' },
  loadingSec: { padding: '56px 32px', textAlign: 'center' },
  spinner: { width: 48, height: 48, border: '3px solid #22222e', borderTopColor: '#ff3c5c', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto' },
  steps: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400, margin: '24px auto 0' },
  step: { background: '#16161e', border: '1px solid #22222e', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#6b6b80' },
  stepActive: { borderColor: '#ff3c5c', color: '#f0f0f8' },
  stepDone: { borderColor: '#22c55e', color: '#22c55e' },
  resultsSec: { padding: '28px 32px' },
  resultsHdr: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  resultsTitle: { fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 700 },
  scoreBadge: { display: 'flex', alignItems: 'center', gap: 10, background: '#16161e', border: '1px solid #22222e', borderRadius: 12, padding: '10px 20px' },
  scoreNum: { fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800, background: 'linear-gradient(135deg,#22c55e,#86efac)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  scoreLbl: { fontSize: 12, color: '#6b6b80', lineHeight: 1.3 },
  prodInfo: { background: '#16161e', border: '1px solid #22222e', borderRadius: 14, padding: 18, marginBottom: 22, display: 'flex', gap: 16, alignItems: 'center' },
  prodThumb: { width: 56, height: 56, background: 'linear-gradient(135deg,#7c3aed,#ff3c5c)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, overflow: 'hidden' },
  tabs: { display: 'flex', gap: 4, background: '#060608', border: '1px solid #22222e', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' },
  tab: { background: 'transparent', border: 'none', color: '#6b6b80', padding: '7px 16px', borderRadius: 7, fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer' },
  tabActive: { background: '#16161e', color: '#f0f0f8' },
  adsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(255px,1fr))', gap: 16 },
  adCard: { background: '#16161e', border: '1px solid #22222e', borderRadius: 14, overflow: 'hidden', transition: 'all .25s', position: 'relative' },
  adCardWinner: { borderColor: '#22c55e' },
  winnerBadge: { position: 'absolute', top: 10, right: 10, background: '#22c55e', color: '#000', fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '3px 8px', borderRadius: 6, zIndex: 2 },
  adImgWrap: { height: 180, position: 'relative', overflow: 'hidden', background: '#060608' },
  imgLoading: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#060608' },
  imgSpinner: { width: 28, height: 28, border: '2px solid #22222e', borderTopColor: '#ff3c5c', borderRadius: '50%', animation: 'spin .7s linear infinite' },
  adBody: { padding: 14 },
  adType: { fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#ff3c5c', marginBottom: 6 },
  adHl: { fontFamily: 'Syne, sans-serif', fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 7 },
  adCopy: { fontSize: 12, color: '#6b6b80', lineHeight: 1.6, marginBottom: 10 },
  adCta: { display: 'inline-block', background: '#ff3c5c', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 },
  adActions: { display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid #22222e' },
  btnAction: { flex: 1, background: '#060608', border: '1px solid #22222e', color: '#6b6b80', padding: 7, borderRadius: 8, fontFamily: 'DM Sans, sans-serif', fontSize: 11, cursor: 'pointer' },
  scoreSec: { background: '#16161e', border: '1px solid #22222e', borderRadius: 14, padding: 20, marginTop: 22 },
  scoreTit: { fontFamily: 'Syne, sans-serif', fontSize: 14, fontWeight: 700, marginBottom: 16 },
  scoreGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 },
  barBg: { height: 5, background: '#22222e', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, transition: 'width 1s ease' },
  regenRow: { display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' },
  btnRegen: { background: '#16161e', border: '1px solid #22222e', color: '#f0f0f8', padding: '10px 20px', borderRadius: 10, fontFamily: 'DM Sans, sans-serif', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 },
  statsRow: { display: 'flex', gap: 1, borderTop: '1px solid #22222e', background: '#22222e' },
  stat: { flex: 1, background: '#0f0f14', padding: '14px 20px', textAlign: 'center' },
  statN: { fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg,#ff3c5c,#ff8c42)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  statD: { fontSize: 11, color: '#6b6b80', marginTop: 2 },
  toast: { position: 'fixed', bottom: 24, right: 24, background: '#16161e', border: '1px solid #22c55e', color: '#22c55e', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 1000 },
}
