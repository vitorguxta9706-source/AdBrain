import { useState, useEffect } from 'react'
import Head from 'next/head'

const THEMES = {
  'Urgência':    { bg: ['#1a0505','#7f1d1d','#dc2626'], accent: '#ff4444' },
  'Social Proof':{ bg: ['#0a1628','#1e3a5f','#1d4ed8'], accent: '#60a5fa' },
  'Benefício':   { bg: ['#0a1a0a','#14532d','#15803d'], accent: '#4ade80' },
  'Curiosidade': { bg: ['#1a0a2e','#4c1d95','#7c3aed'], accent: '#a78bfa' },
  'Oferta':      { bg: ['#1a1000','#92400e','#d97706'], accent: '#fbbf24' },
  'default':     { bg: ['#111','#222','#333'],           accent: '#ffffff' },
}

export default function Home() {
  const [screen, setScreen]     = useState('setup')
  const [cfg, setCfg]           = useState({ anthropicKey: '', hfToken: '' })
  const [url, setUrl]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [step, setStep]         = useState(0)
  const [product, setProduct]   = useState(null)
  const [ads, setAds]           = useState([])
  const [score, setScore]       = useState(null)
  const [adImages, setAdImages] = useState({})
  const [toast, setToast]       = useState(null)
  const [activeTab, setActiveTab] = useState('todos')
  const [publico, setPublico]   = useState('🎯 Público: Geral')
  const [objetivo, setObjetivo] = useState('💰 Objetivo: Vendas')
  const [plat, setPlat]         = useState('📱 Meta Ads')
  const [akVal, setAkVal]       = useState('')
  const [hfVal, setHfVal]       = useState('')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('adbrain_cfg')
      if (saved) {
        const c = JSON.parse(saved)
        setCfg(c)
        setAkVal(c.anthropicKey || '')
        setHfVal(c.hfToken || '')
        if (c.anthropicKey) setScreen('app')
      }
    } catch(e) {}
  }, [])

  const showToast = (msg, color = '#22c55e') => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 3500)
  }

  const saveConfig = () => {
    if (!akVal.trim()) { showToast('⚠️ Cole a Anthropic API Key', '#ff8c42'); return }
    const c = { anthropicKey: akVal.trim(), hfToken: hfVal.trim() }
    setCfg(c)
    localStorage.setItem('adbrain_cfg', JSON.stringify(c))
    setScreen('app')
    showToast('✅ Configurado!')
  }

  const startGen = async () => {
    if (!url.trim()) { showToast('⚠️ Cole o link do produto!', '#ff8c42'); return }
    setLoading(true); setStep(1); setAds([]); setAdImages({}); setProduct(null); setScore(null)

    try {
      // Step 1 — busca dados reais do produto (server-side, sem CORS)
      let pd = { name: '', image: '', price: '', description: '', category: 'E-commerce' }
      try {
        const r = await fetch(`/api/product?url=${encodeURIComponent(url)}`)
        if (r.ok) pd = await r.json()
      } catch(e) {}
      if (!pd.name) pd.name = nameFromUrl(url)

      // Step 2 — gera copy
      setStep(2)
      let result = cfg.anthropicKey ? await callClaude(pd) : demoData(pd.name)
      result.product.image = pd.image || ''
      setProduct(result.product); setScore(result.score); setAds(result.ads)

      // Step 3 — gera imagens dos criativos
      setStep(3)
      buildImages(result.ads, result.product, pd.image)

      setStep(4)
    } catch(e) {
      console.error(e)
      showToast('Erro ao gerar. Tente novamente.', '#ff3c5c')
    } finally {
      setLoading(false)
    }
  }

  const callClaude = async (pd) => {
    const prompt = `Especialista em marketing digital para e-commerce brasileiro.

PRODUTO: "${pd.name}" | Categoria: ${pd.category} | Preço: ${pd.price || '?'} | Desc: ${pd.description || ''}
Público: ${publico} | Objetivo: ${objetivo} | Plataforma: ${plat}

Crie 5 anúncios usando o NOME REAL do produto nas headlines.

JSON APENAS:
{"product":{"name":"nome real","category":"categoria","price":"preço","emoji":"emoji","description":"benefício 1 frase"},
"score":{"overall":78,"appeal":82,"urgency":75,"trust":71,"price":85,"competition":62},
"ads":[
{"type":"Urgência","headline":"headline com nome do produto max 8 palavras","copy":"copy 2-3 frases gatilho urgência","cta":"GARANTIR AGORA","winner":false,"badge":"ÚLTIMAS UNIDADES","tagline":"Só hoje"},
{"type":"Social Proof","headline":"headline social proof","copy":"copy prova social","cta":"QUERO O MEU","winner":false,"badge":"+5.000 VENDIDOS","tagline":"Aprovado"},
{"type":"Benefício","headline":"headline benefício real","copy":"copy benefício","cta":"APROVEITAR AGORA","winner":false,"badge":"GARANTIA 30 DIAS","tagline":"Sem risco"},
{"type":"Curiosidade","headline":"headline curiosidade","copy":"copy curiosidade","cta":"DESCOBRIR AGORA","winner":false,"badge":"EXCLUSIVO","tagline":"Descubra"},
{"type":"Oferta","headline":"headline oferta irresistível","copy":"copy oferta","cta":"PEGAR DESCONTO","winner":true,"badge":"FRETE GRÁTIS","tagline":"Só hoje"}
]}`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
    })
    if (!r.ok) throw new Error('Claude ' + r.status)
    const d = await r.json()
    const txt = d.content.map(i => i.text || '').join('')
    return JSON.parse(txt.replace(/```json|```/g, '').trim())
  }

  const buildImages = async (adsList, prod, realImgUrl) => {
    let prodImg = null
    if (realImgUrl) {
      try { prodImg = await loadImg(`/api/image-proxy?url=${encodeURIComponent(realImgUrl)}`) } catch(e) {}
    }
    adsList.forEach((ad, i) => {
      renderCreative(ad, prod, prodImg).then(url => {
        setAdImages(prev => ({ ...prev, [i]: url }))
      })
    })
  }

  const loadImg = (src) => new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => res(img); img.onerror = rej
    setTimeout(() => rej('timeout'), 10000)
    img.src = src
  })

  const renderCreative = async (ad, prod, prodImg) => {
    const W = 800, H = 600
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    const th = THEMES[ad.type] || THEMES.default
    const ac = th.accent

    const g = ctx.createLinearGradient(0, 0, W, H)
    th.bg.forEach((c, i, a) => g.addColorStop(i / (a.length - 1 || 1), c))
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    ctx.globalAlpha = 0.12; ctx.fillStyle = ac
    ctx.beginPath(); ctx.arc(W * .85, H * .15, 200, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(W * .1, H * .85, 150, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    const lg = ctx.createLinearGradient(0, 0, W, 0)
    lg.addColorStop(0, 'transparent'); lg.addColorStop(.5, ac); lg.addColorStop(1, 'transparent')
    ctx.fillStyle = lg; ctx.fillRect(0, 0, W, 5)

    if (prodImg && prodImg.naturalWidth > 0) {
      const sz = 230, ix = W / 2 - sz / 2, iy = 22
      ctx.shadowColor = ac; ctx.shadowBlur = 60
      ctx.save(); rrPath(ctx, ix, iy, sz, sz, 22); ctx.clip()
      ctx.drawImage(prodImg, ix, iy, sz, sz)
      ctx.restore(); ctx.shadowBlur = 0
      ctx.strokeStyle = ac; ctx.lineWidth = 2.5; ctx.globalAlpha = .6
      rrPath(ctx, ix, iy, sz, sz, 22); ctx.stroke(); ctx.globalAlpha = 1
    } else {
      ctx.font = '120px serif'; ctx.textAlign = 'center'
      ctx.shadowColor = ac; ctx.shadowBlur = 50
      ctx.fillText(prod?.emoji || '🛍️', W / 2, 190); ctx.shadowBlur = 0
    }

    ctx.font = 'bold 14px Arial'; ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.textAlign = 'center'
    ctx.fillText((prod?.name || '').toUpperCase().substring(0, 40), W / 2, prodImg ? 275 : 235)

    let cy = prodImg ? 292 : 252
    if (ad.badge) {
      ctx.font = 'bold 12px Arial'
      const bw = ctx.measureText(ad.badge).width + 26
      ctx.fillStyle = ac; ctx.globalAlpha = .95
      rrPath(ctx, W / 2 - bw / 2, cy, bw, 26, 13); ctx.fill()
      ctx.globalAlpha = 1; ctx.fillStyle = isLight(ac) ? '#000' : '#fff'; ctx.textAlign = 'center'
      ctx.fillText(ad.badge, W / 2, cy + 17); cy += 36
    }
    if (ad.tagline) {
      ctx.font = 'bold 16px Arial'; ctx.fillStyle = ac; ctx.globalAlpha = .9; ctx.textAlign = 'center'
      ctx.fillText(ad.tagline.toUpperCase(), W / 2, cy + 10); ctx.globalAlpha = 1; cy += 30
    }

    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 8
    wrapTxt(ctx, ad.headline.replace(/[⚡🔥✅🤫🌟🛍️🔮]/gu, '').trim(), W / 2, cy + 18, W - 80, 32, 'bold 24px Arial')
    ctx.shadowBlur = 0

    ctx.fillStyle = ac; ctx.globalAlpha = .3
    ctx.fillRect(W / 2 - 45, cy + 72, 90, 2); ctx.globalAlpha = 1

    ctx.font = 'bold 15px Arial'
    const cw = Math.min(ctx.measureText(ad.cta).width + 80, 290), ch = 46
    const cx = W / 2 - cw / 2, ctaY = cy + 90
    ctx.shadowColor = ac; ctx.shadowBlur = 25
    ctx.fillStyle = ac; rrPath(ctx, cx, ctaY, cw, ch, 23); ctx.fill()
    ctx.shadowBlur = 0; ctx.fillStyle = isLight(ac) ? '#000' : '#fff'
    ctx.fillText(ad.cta, W / 2, ctaY + 30)

    ctx.fillStyle = lg; ctx.fillRect(0, H - 4, W, 4)
    return canvas.toDataURL('image/jpeg', .93)
  }

  const rrPath = (ctx, x, y, w, h, r) => {
    ctx.beginPath(); ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
  }

  const wrapTxt = (ctx, text, x, y, mw, lh, font) => {
    ctx.font = font; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
    const words = text.split(' '); let line = '', cy = y
    for (const w of words) {
      const t = line ? line + ' ' + w : w
      if (ctx.measureText(t).width > mw && line) { ctx.fillText(line, x, cy); line = w; cy += lh }
      else line = t
    }
    if (line) ctx.fillText(line, x, cy)
  }

  const isLight = (hex) => {
    const c = (hex || '#888').replace('#', '').padEnd(6, '0')
    return (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000 > 128
  }

  const nameFromUrl = (url) => {
    try {
      const u = new URL(url)
      const m = u.pathname.match(/\/(.+)-i\.\d+\.\d+/)
      if (m) return decodeURIComponent(m[1].replace(/-/g, ' '))
      return u.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || ''
    } catch(e) { return '' }
  }

  const demoData = (name) => ({
    product: { name: name || 'Produto Demo', category: 'E-commerce', price: 'R$ 97', emoji: '🛍️', description: 'Produto de qualidade' },
    score: { overall: 76, appeal: 80, urgency: 74, trust: 68, price: 82, competition: 58 },
    ads: [
      { type: 'Urgência',    headline: `⚡ ${name} — últimas unidades!`, copy: 'Estoque limitado. Garante o seu agora.', cta: 'GARANTIR AGORA',   winner: true,  badge: 'ÚLTIMAS UNIDADES', tagline: 'Só hoje'  },
      { type: 'Social Proof',headline: `🌟 +5.000 clientes amam ${name}`, copy: 'Qualidade aprovada por milhares.',       cta: 'QUERO O MEU',     winner: false, badge: '+5.000 VENDIDOS', tagline: 'Aprovado' },
      { type: 'Benefício',   headline: `✅ ${name} com garantia total`,   copy: 'Zero risco. 30 dias de garantia.',      cta: 'APROVEITAR AGORA',winner: false, badge: 'GARANTIA 30 DIAS', tagline: 'Sem risco'},
      { type: 'Curiosidade', headline: '🤫 O segredo que ninguém te contou', copy: 'Profissionais usam isso há anos.',    cta: 'DESCOBRIR AGORA', winner: false, badge: 'EXCLUSIVO',       tagline: 'Descubra' },
      { type: 'Oferta',      headline: `🔥 ${name} com 50% OFF hoje`,     copy: 'Frete grátis + brinde surpresa.',       cta: 'PEGAR DESCONTO',  winner: false, badge: 'FRETE GRÁTIS',    tagline: 'Só hoje'  },
    ]
  })

  const copyAd = (ad) => navigator.clipboard.writeText(`${ad.headline}\n\n${ad.copy}\n\n👉 ${ad.cta}`).then(() => showToast('✅ Copy copiada!'))

  const downloadImg = (i) => {
    const src = adImages[i]
    if (!src) { showToast('⏳ Aguarde...', '#ff8c42'); return }
    const a = document.createElement('a'); a.href = src; a.download = `adbrain-ad-${i + 1}.jpg`; a.click()
    showToast('⬇️ Baixado!', '#7c3aed')
  }

  const exportAll = () => {
    const txt = ads.map((ad, i) => `=== ANÚNCIO ${i + 1} — ${ad.type} ${ad.winner ? '⭐' : ''} ===\n${ad.headline}\n${ad.copy}\n${ad.cta}\n`).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'adbrain.txt'; a.click()
    showToast('📦 Exportado!')
  }

  const filteredAds = activeTab === 'todos' ? ads : activeTab === 'copy' ? ads.slice(0, 3) : ads.slice(2)

  if (screen === 'setup') return (
    <div style={S.page}>
      <Head><title>AdBrain — Setup</title></Head>
      <div style={S.setupWrap}>
        <div style={S.logo}>Ad<span style={{ color: '#ff3c5c' }}>Brain</span></div>
        <div style={S.card}>
          <h2 style={S.cardTitle}>⚙️ Configuração Inicial</h2>
          <p style={S.cardSub}>Cole suas chaves abaixo. Ficam salvas <strong>só no seu navegador</strong>.</p>
          <label style={S.label}>ANTHROPIC API KEY</label>
          <input type="password" placeholder="sk-ant-..." style={S.input} value={akVal} onChange={e => setAkVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveConfig()} />
          <div style={S.hint}>Obtenha em: <a href="https://console.anthropic.com" target="_blank" style={S.link}>console.anthropic.com</a></div>
          <div style={{ height: 14 }} />
          <label style={S.label}>HUGGING FACE TOKEN <span style={{ opacity: .5, fontWeight: 400 }}>(opcional)</span></label>
          <input type="password" placeholder="hf_..." style={S.input} value={hfVal} onChange={e => setHfVal(e.target.value)} />
          <div style={S.hint}>Gratuito em: <a href="https://huggingface.co/settings/tokens" target="_blank" style={S.link}>huggingface.co → Settings → Tokens</a></div>
          <button style={S.btnMain} onClick={saveConfig}>💾 Salvar e Começar</button>
        </div>
      </div>
      {toast && <div style={{ ...S.toast, borderColor: toast.color, color: toast.color }}>{toast.msg}</div>}
    </div>
  )

  return (
    <div style={S.page}>
      <Head><title>AdBrain — Anúncios que Vendem</title></Head>

      <nav style={S.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={S.logo}>Ad<span style={{ color: '#ff3c5c' }}>Brain</span></span>
          <span style={S.badge}>BETA</span>
        </div>
        <button style={S.btnSm} onClick={() => setScreen('setup')}>⚙️ Config</button>
      </nav>

      <div style={S.hero}>
        <div style={S.pill}><span style={S.dot} /> IA ativa · Gerando anúncios agora</div>
        <h1 style={S.h1}>Anúncios que<br /><em style={{ fontStyle: 'normal', color: '#ff3c5c' }}>realmente vendem</em></h1>
        <p style={S.sub}>Cole o link do produto. Em segundos você tem copy, imagem real e score de potencial.</p>
      </div>

      <div style={S.wrap}>
        <div style={S.appCard}>

          <div style={S.inputSec}>
            <div style={S.inputLbl}>⚡ LINK DO PRODUTO</div>
            <div style={S.urlRow}>
              <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && startGen()} placeholder="https://shopee.com.br/produto... Yampi, Shopify, etc." style={S.urlInput} />
              <button style={{ ...S.btnGen, opacity: loading ? .6 : 1 }} disabled={loading} onClick={startGen}>
                {loading ? '⏳ Gerando...' : '🧠 Gerar Anúncios'}
              </button>
            </div>
            <div style={S.metaRow}>
              {[
                [publico, setPublico, ['🎯 Público: Geral','🛍️ Dropshipping','📦 E-commerce','🤝 Afiliados']],
                [objetivo, setObjetivo, ['💰 Objetivo: Vendas','👁️ Alcance','🖱️ Tráfego']],
                [plat, setPlat, ['📱 Meta Ads','🎵 TikTok Ads','🔍 Google Ads']],
              ].map(([val, setter, opts], i) => (
                <select key={i} value={val} onChange={e => setter(e.target.value)} style={S.sel}>
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              ))}
            </div>
          </div>

          {loading && (
            <div style={S.loadSec}>
              <div style={S.spinner} />
              <p style={{ marginTop: 18, color: '#6b6b80', fontSize: 14 }}>Sua IA está trabalhando...</p>
              <div style={S.steps}>
                {['🔍 Buscando dados e imagem do produto','✍️ Criando copies persuasivas','🎨 Montando criativos com imagem real','📊 Calculando score de potencial'].map((t, i) => (
                  <div key={i} style={{ ...S.step, ...(step === i + 1 ? S.stepOn : {}), ...(step > i + 1 ? S.stepDone : {}) }}>{t}</div>
                ))}
              </div>
            </div>
          )}

          {!loading && ads.length > 0 && (
            <div style={S.resSec}>
              <div style={S.resHdr}>
                <span style={S.resTitle}>5 Anúncios Gerados ✅</span>
                {score && <div style={S.scoreBadge}><div style={S.scoreN}>{score.overall}%</div><div style={S.scoreLbl}>Score de<br />potencial</div></div>}
              </div>

              {product && (
                <div style={S.prodRow}>
                  <div style={S.prodThumb}>
                    {product.image
                      ? <img src={`/api/image-proxy?url=${encodeURIComponent(product.image)}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} onError={e => { e.target.style.display = 'none' }} />
                      : product.emoji || '🛍️'}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{product.name}</div>
                    <div style={{ fontSize: 12, color: '#6b6b80' }}>{product.category} · {product.price} · {product.description}</div>
                  </div>
                </div>
              )}

              <div style={S.tabs}>
                {[['todos','Todos'],['copy','📝 Copy'],['criativo','🎨 Criativo']].map(([t, l]) => (
                  <button key={t} style={{ ...S.tab, ...(activeTab === t ? S.tabOn : {}) }} onClick={() => setActiveTab(t)}>{l}</button>
                ))}
              </div>

              <div style={S.grid}>
                {filteredAds.map((ad, i) => {
                  const ri = ads.indexOf(ad)
                  return (
                    <div key={ri} style={{ ...S.adCard, ...(ad.winner ? S.adWinner : {}) }}>
                      {ad.winner && <div style={S.winBadge}>⭐ VENCEDOR</div>}
                      <div style={S.adImg}>
                        {adImages[ri]
                          ? <img src={adImages[ri]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                          : <div style={S.imgLoad}><div style={S.imgSpin} /><p style={{ fontSize: 11, color: '#6b6b80', marginTop: 8 }}>Montando criativo...</p></div>}
                      </div>
                      <div style={S.adBody}>
                        <div style={S.adType}>{ad.type}</div>
                        <div style={S.adHl}>{ad.headline}</div>
                        <div style={S.adCopy}>{ad.copy}</div>
                        <div style={S.adCta}>{ad.cta}</div>
                      </div>
                      <div style={S.adBtns}>
                        <button style={S.btnAct} onClick={() => copyAd(ad)}>📋 Copiar copy</button>
                        <button style={S.btnAct} onClick={() => downloadImg(ri)}>⬇️ Baixar</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {score && (
                <div style={S.scoreSec}>
                  <div style={S.scoreTit}>📊 Análise de Potencial de Venda</div>
                  <div style={S.scoreGrid}>
                    {Object.entries({ appeal:'Apelo Visual', urgency:'Urgência', trust:'Confiança', price:'Preço', competition:'Concorrência' }).map(([k, l]) => (
                      <div key={k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b6b80', marginBottom: 5 }}>
                          <span>{l}</span><span style={{ color: '#f0f0f8' }}>{score[k]}%</span>
                        </div>
                        <div style={S.barBg}><div style={{ ...S.barFill, width: `${score[k]}%`, background: score[k] >= 75 ? 'linear-gradient(90deg,#22c55e,#86efac)' : score[k] >= 55 ? 'linear-gradient(90deg,#ff8c42,#fbbf24)' : 'linear-gradient(90deg,#7c3aed,#ff3c5c)' }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={S.regenRow}>
                <button style={S.btnRegen} onClick={startGen}>🔄 Novas variações</button>
                <button style={S.btnRegen} onClick={exportAll}>📦 Exportar tudo</button>
              </div>
            </div>
          )}

          <div style={S.statsRow}>
            {[['12.4k','Anúncios gerados'],['R$2.1M','Vendas atribuídas'],['4.8x','ROAS médio']].map(([n, d]) => (
              <div key={d} style={S.stat}><div style={S.statN}>{n}</div><div style={S.statD}>{d}</div></div>
            ))}
          </div>
        </div>
      </div>

      {toast && <div style={{ ...S.toast, borderColor: toast.color, color: toast.color }}>{toast.msg}</div>}
    </div>
  )
}

const S = {
  page:      { background: '#060608', minHeight: '100vh', color: '#f0f0f8', fontFamily: "'DM Sans',sans-serif", overflowX: 'hidden' },
  setupWrap: { maxWidth: 520, margin: '0 auto', padding: '60px 24px', textAlign: 'center' },
  logo:      { fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, marginBottom: 32 },
  card:      { background: '#0f0f14', border: '1px solid #22222e', borderRadius: 20, padding: 32, textAlign: 'left' },
  cardTitle: { fontFamily: "'Syne',sans-serif", fontSize: 18, marginBottom: 8 },
  cardSub:   { fontSize: 13, color: '#6b6b80', marginBottom: 20, lineHeight: 1.6 },
  label:     { fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b6b80', display: 'block', marginBottom: 6 },
  input:     { width: '100%', background: '#060608', border: '1px solid #22222e', borderRadius: 10, padding: '12px 16px', color: '#f0f0f8', fontFamily: 'inherit', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  hint:      { fontSize: 11, color: '#6b6b80', marginTop: 5 },
  link:      { color: '#ff3c5c', textDecoration: 'none' },
  btnMain:   { width: '100%', background: 'linear-gradient(135deg,#ff3c5c,#ff8c42)', border: 'none', color: '#fff', padding: 14, borderRadius: 10, fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 16, boxShadow: '0 4px 24px rgba(255,60,92,.3)' },
  nav:       { position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 40px', background: 'rgba(6,6,8,.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #22222e' },
  badge:     { background: '#ff3c5c', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: 1 },
  btnSm:     { background: 'transparent', border: '1px solid #22222e', color: '#6b6b80', padding: '7px 16px', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' },
  hero:      { textAlign: 'center', padding: '70px 40px 40px', maxWidth: 860, margin: '0 auto' },
  pill:      { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#16161e', border: '1px solid #22222e', padding: '6px 16px', borderRadius: 100, fontSize: 12, color: '#6b6b80', marginBottom: 24 },
  dot:       { width: 6, height: 6, background: '#22c55e', borderRadius: '50%', display: 'inline-block' },
  h1:        { fontFamily: "'Syne',sans-serif", fontSize: 'clamp(34px,6vw,60px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginBottom: 16 },
  sub:       { fontSize: 16, color: '#6b6b80', maxWidth: 520, margin: '0 auto 40px', lineHeight: 1.7, fontWeight: 300 },
  wrap:      { maxWidth: 900, margin: '0 auto 80px', padding: '0 24px' },
  appCard:   { background: '#0f0f14', border: '1px solid #22222e', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)' },
  inputSec:  { padding: '28px 32px', borderBottom: '1px solid #22222e', background: 'linear-gradient(135deg,#0f0f14,#16161e)' },
  inputLbl:  { fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#6b6b80', marginBottom: 10 },
  urlRow:    { display: 'flex', gap: 12 },
  urlInput:  { flex: 1, background: '#060608', border: '1px solid #22222e', borderRadius: 10, padding: '13px 18px', color: '#f0f0f8', fontFamily: 'inherit', fontSize: 15, outline: 'none' },
  btnGen:    { background: 'linear-gradient(135deg,#ff3c5c,#ff8c42)', border: 'none', color: '#fff', padding: '13px 26px', borderRadius: 10, fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(255,60,92,.3)' },
  metaRow:   { display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  sel:       { background: '#060608', border: '1px solid #22222e', borderRadius: 8, padding: '7px 12px', color: '#6b6b80', fontFamily: 'inherit', fontSize: 13, outline: 'none', cursor: 'pointer' },
  loadSec:   { padding: '56px 32px', textAlign: 'center' },
  spinner:   { width: 48, height: 48, border: '3px solid #22222e', borderTopColor: '#ff3c5c', borderRadius: '50%', animation: 'spin .8s linear infinite', margin: '0 auto' },
  steps:     { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400, margin: '24px auto 0' },
  step:      { background: '#16161e', border: '1px solid #22222e', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#6b6b80' },
  stepOn:    { borderColor: '#ff3c5c', color: '#f0f0f8' },
  stepDone:  { borderColor: '#22c55e', color: '#22c55e' },
  resSec:    { padding: '28px 32px' },
  resHdr:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  resTitle:  { fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 700 },
  scoreBadge:{ display: 'flex', alignItems: 'center', gap: 10, background: '#16161e', border: '1px solid #22222e', borderRadius: 12, padding: '10px 20px' },
  scoreN:    { fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, background: 'linear-gradient(135deg,#22c55e,#86efac)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  scoreLbl:  { fontSize: 12, color: '#6b6b80', lineHeight: 1.3 },
  prodRow:   { background: '#16161e', border: '1px solid #22222e', borderRadius: 14, padding: 18, marginBottom: 22, display: 'flex', gap: 16, alignItems: 'center' },
  prodThumb: { width: 56, height: 56, background: 'linear-gradient(135deg,#7c3aed,#ff3c5c)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, overflow: 'hidden' },
  tabs:      { display: 'flex', gap: 4, background: '#060608', border: '1px solid #22222e', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' },
  tab:       { background: 'transparent', border: 'none', color: '#6b6b80', padding: '7px 16px', borderRadius: 7, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' },
  tabOn:     { background: '#16161e', color: '#f0f0f8' },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(255px,1fr))', gap: 16 },
  adCard:    { background: '#16161e', border: '1px solid #22222e', borderRadius: 14, overflow: 'hidden', position: 'relative' },
  adWinner:  { borderColor: '#22c55e' },
  winBadge:  { position: 'absolute', top: 10, right: 10, background: '#22c55e', color: '#000', fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '3px 8px', borderRadius: 6, zIndex: 2 },
  adImg:     { height: 180, position: 'relative', overflow: 'hidden', background: '#060608' },
  imgLoad:   { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  imgSpin:   { width: 28, height: 28, border: '2px solid #22222e', borderTopColor: '#ff3c5c', borderRadius: '50%', animation: 'spin .7s linear infinite' },
  adBody:    { padding: 14 },
  adType:    { fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#ff3c5c', marginBottom: 6 },
  adHl:      { fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 7 },
  adCopy:    { fontSize: 12, color: '#6b6b80', lineHeight: 1.6, marginBottom: 10 },
  adCta:     { display: 'inline-block', background: '#ff3c5c', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20 },
  adBtns:    { display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid #22222e' },
  btnAct:    { flex: 1, background: '#060608', border: '1px solid #22222e', color: '#6b6b80', padding: 7, borderRadius: 8, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' },
  scoreSec:  { background: '#16161e', border: '1px solid #22222e', borderRadius: 14, padding: 20, marginTop: 22 },
  scoreTit:  { fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, marginBottom: 16 },
  scoreGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 },
  barBg:     { height: 5, background: '#22222e', borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: '100%', borderRadius: 3, transition: 'width 1s ease' },
  regenRow:  { display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' },
  btnRegen:  { background: '#16161e', border: '1px solid #22222e', color: '#f0f0f8', padding: '10px 20px', borderRadius: 10, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' },
  statsRow:  { display: 'flex', gap: 1, borderTop: '1px solid #22222e', background: '#22222e' },
  stat:      { flex: 1, background: '#0f0f14', padding: '14px 20px', textAlign: 'center' },
  statN:     { fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg,#ff3c5c,#ff8c42)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  statD:     { fontSize: 11, color: '#6b6b80', marginTop: 2 },
  toast:     { position: 'fixed', bottom: 24, right: 24, background: '#16161e', border: '1px solid', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500, zIndex: 1000 },
}
