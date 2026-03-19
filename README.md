# AdBrain 🧠

Gerador de anúncios com IA — copy + criativo + score de potencial.

## Deploy no Vercel (5 minutos)

### 1. Suba para o GitHub
```bash
git init
git add .
git commit -m "AdBrain inicial"
git remote add origin https://github.com/SEU_USUARIO/adbrain.git
git push -u origin main
```

### 2. Deploy no Vercel
1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **"New Project"**
3. Importe o repositório `adbrain`
4. Clique em **"Deploy"** — pronto!

### 3. Configure as variáveis (opcional)
No Vercel → Settings → Environment Variables:
- Não há variáveis obrigatórias — as chaves ficam no browser do usuário

## Como usar
1. Acesse sua URL do Vercel (ex: `adbrain.vercel.app`)
2. Cole sua **Anthropic API Key** na tela de configuração
3. Cole o link de qualquer produto (Shopee, Yampi, Shopify, etc.)
4. Clique em **Gerar Anúncios**

## Stack
- **Frontend**: Next.js + React
- **Backend**: Vercel API Routes (Node.js)
- **IA Copy**: Claude (Anthropic)
- **Imagens**: Canvas API + imagem real do produto
- **Scraping**: Server-side (sem CORS)
