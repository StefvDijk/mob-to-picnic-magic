import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import PicnicClient from 'picnic-api'

const app = express()
app.use(cors({ origin: '*', credentials: true }))
app.use(express.json())

// In-memory storage for demo/MVP
const users = new Map()
// users.set('demo@example.com', { name: 'Demo', passwordHash: bcrypt.hashSync('demo123', 10), picnic: { username: '', passwordEnc: '' } })

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// Very light-weight symmetric "encryption" for demo purposes only. Replace with KMS/real crypto.
function simpleXor(input, key) {
  const inputBytes = Buffer.from(input, 'utf8')
  const keyBytes = Buffer.from(key, 'utf8')
  const out = Buffer.allocUnsafe(inputBytes.length)
  for (let i = 0; i < inputBytes.length; i++) {
    out[i] = inputBytes[i] ^ keyBytes[i % keyBytes.length]
  }
  return out.toString('base64')
}
function simpleXorDecrypt(b64, key) {
  const inputBytes = Buffer.from(b64, 'base64')
  const keyBytes = Buffer.from(key, 'utf8')
  const out = Buffer.allocUnsafe(inputBytes.length)
  for (let i = 0; i < inputBytes.length; i++) {
    out[i] = inputBytes[i] ^ keyBytes[i % keyBytes.length]
  }
  return out.toString('utf8')
}

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }))

// Simple ingredient parser for free-form text
const FILLER_PREFIX_RE = /^(neem|pak|zorg|dat|je|genoeg|heb|hebt|voorraad|en|of)\b\s*/i
const COMMON_CORRECTIONS = new Map([
  ['yohgurt', 'yoghurt'],
  ['yougurt', 'yoghurt'],
  ['yogurt', 'yoghurt'],
  ['bloemen', 'bloem'],
  ['tomaat', 'tomaten']
])

function normalizeName(name) {
  let n = name.trim()
  // strip repeated filler words at the start
  while (FILLER_PREFIX_RE.test(n)) {
    n = n.replace(FILLER_PREFIX_RE, '').trim()
  }
  // collapse multiple spaces
  n = n.replace(/\s{2,}/g, ' ')
  const lower = n.toLowerCase()
  if (COMMON_CORRECTIONS.has(lower)) return COMMON_CORRECTIONS.get(lower)
  // minor punctuation trims
  n = n.replace(/^[.,;:\-]+/, '').replace(/[.,;:\-]+$/, '').trim()
  return n
}

function parseIngredientLine(line) {
  const trimmed = (line || '').replace(/^[-•*]\s*/, '').trim()
  if (!trimmed) return null
  // Examples: "2 x tomaten", "2x tomaten", "200 g kipfilet", "1 tbsp sugar"
  const pattern = /^(\d+(?:[\.,]\d+)?)\s*(x|×)?\s*(?:of\s+)?(g|gram|kg|ml|l|liter|tbsp|tsp|el|tl|cup|cups|pack|pak|st|stuk|stuks)?\s*(.*)$/i
  const m = trimmed.match(pattern)
  if (m) {
    const qty = m[1]
    const mult = m[2] ? 'x' : ''
    const unit = (m[3] || '').toLowerCase()
    const name = normalizeName((m[4] || '').trim() || trimmed)
    return { quantity: mult ? qty : qty, unit, name }
  }
  return { name: normalizeName(trimmed) }
}

function splitCandidates(text) {
  // Split on line breaks and punctuation first
  const primary = text
    .split(/[\n,.;]/)
    .map(s => s.trim())
    .filter(Boolean)
  const candidates = []
  for (const seg of primary) {
    // Further split on Dutch conjunctions if the segment is long
    if (seg.toLowerCase().includes(' en ')) {
      candidates.push(...seg.split(/\ben\b/i).map(s => s.trim()).filter(Boolean))
    } else if (seg.toLowerCase().includes(' of ')) {
      candidates.push(...seg.split(/\bof\b/i).map(s => s.trim()).filter(Boolean))
    } else {
      candidates.push(seg)
    }
  }
  return candidates
}

// --- Matching helpers for Picnic search ---
const SEARCH_CORRECTIONS = new Map([
  ['yohgurt', 'yoghurt'],
  ['yougurt', 'yoghurt'],
  ['yogurt', 'yoghurt'],
  ['bloemen', 'bloem'],
  ['tomaat', 'tomaten'],
  ['spagetti', 'spaghetti'],
  ['courgette', 'courgette'],
])

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function normalizeForSearch(name) {
  let n = String(name || '').toLowerCase().trim()
  n = stripDiacritics(n)
  // remove punctuation, extra spaces
  n = n.replace(/[()\[\]{}.,;:!?”“"'`]/g, ' ').replace(/\s{2,}/g, ' ').trim()
  // drop common descriptors that harm search
  n = n.replace(/\b(verse|vers|bio|biologisch|grote|kleine|klein|groot|extra|milde|mager|vol|light)\b/g, '').replace(/\s{2,}/g, ' ').trim()
  if (SEARCH_CORRECTIONS.has(n)) return SEARCH_CORRECTIONS.get(n)
  return n
}

function singularizeDutch(word) {
  if (!word) return word
  // crude singularization for common patterns
  if (/jes$/.test(word)) return word.replace(/jes$/, 'je')
  if (/en$/.test(word) && word.length > 3) return word.slice(0, -2)
  if (/s$/.test(word) && word.length > 3) return word.slice(0, -1)
  return word
}

function generateSearchAlternatives(name) {
  const base = normalizeForSearch(name)
  const alts = new Set([base])
  // singularize last token
  const parts = base.split(' ').filter(Boolean)
  if (parts.length) {
    const last = parts[parts.length - 1]
    const sing = singularizeDutch(last)
    if (sing !== last) {
      const v = [...parts.slice(0, -1), sing].join(' ')
      alts.add(v)
    }
  }
  // try without unit-like words at start
  const UNIT_WORDS = ['gram', 'g', 'kg', 'ml', 'l', 'liter', 'pak', 'pack', 'stuk', 'stuks']
  if (parts.length > 1 && UNIT_WORDS.includes(parts[1])) {
    alts.add(parts.slice(2).join(' '))
  }
  // try without quantity at front
  if (/^\d/.test(base)) {
    const withoutQty = base.replace(/^\d+(?:[\.,]\d+)?\s*(x|×)?\s*/i, '')
    alts.add(withoutQty)
  }
  return Array.from(alts).filter(Boolean)
}

app.post('/parse-ingredients', auth, (req, res) => {
  const { text } = req.body || {}
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' })

  const candidates = splitCandidates(text)
  const items = []
  for (const part of candidates) {
    const parsed = parseIngredientLine(part)
    if (parsed && parsed.name) items.push(parsed)
  }

  // De-duplicate by normalized name
  const seen = new Set()
  const unique = items.filter(i => {
    const key = i.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  res.json({ ingredients: unique.slice(0, 50) })
})

app.post('/auth/register', async (req, res) => {
  const { email, name, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  if (users.has(email)) return res.status(409).json({ error: 'User exists' })
  const passwordHash = await bcrypt.hash(password, 10)
  users.set(email, { name: name || email, passwordHash, picnic: null, mappings: new Map() })
  return res.json({ ok: true })
})

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const user = users.get(email)
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
  const token = jwt.sign({ sub: email, name: user.name }, JWT_SECRET, { expiresIn: '12h' })
  return res.json({ token })
})

app.post('/credentials/picnic', auth, (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username and password required' })
  const email = req.user.sub
  const user = users.get(email)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const passwordEnc = simpleXor(password, JWT_SECRET)
  user.picnic = { username, passwordEnc }
  return res.json({ ok: true })
})

app.get('/credentials/picnic', auth, (req, res) => {
  const email = req.user.sub
  const user = users.get(email)
  if (!user || !user.picnic) return res.json({ username: null, configured: false })
  return res.json({ username: user.picnic.username, configured: true })
})

// --- User ingredient→product mappings ---
// List mappings
app.get('/mappings', auth, (req, res) => {
  const email = req.user.sub
  const user = users.get(email)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const entries = Array.from(user.mappings?.entries?.() || [])
    .map(([key, value]) => ({ key, ...value }))
  return res.json({ mappings: entries })
})

// Save/update a mapping
// body: { sourceName: string, productId: string, productLabel?: string }
app.post('/mappings', auth, (req, res) => {
  const { sourceName, productId, productLabel } = req.body || {}
  if (!sourceName || !productId) return res.status(400).json({ error: 'sourceName and productId required' })
  const email = req.user.sub
  const user = users.get(email)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (!user.mappings) user.mappings = new Map()
  const key = normalizeForSearch(String(sourceName))
  user.mappings.set(key, { productId: String(productId), productLabel: productLabel || '', updatedAt: Date.now() })
  return res.json({ ok: true })
})

// --- Picnic search proxy for mapping UI ---
app.get('/picnic/search', auth, async (req, res) => {
  const email = req.user.sub
  const user = users.get(email)
  if (!user || !user.picnic) return res.status(400).json({ error: 'Picnic credentials not set' })
  const { username, passwordEnc } = user.picnic
  const password = simpleXorDecrypt(passwordEnc, JWT_SECRET)
  const q = String(req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'q required' })
  try {
    const client = new PicnicClient()
    await client.login(username, password)
    const results = await client.search(q)
    const simplified = (results || []).slice(0, 20).map(r => ({
      id: String(r.id),
      name: r.name || r.display_name || r.title || '',
      price: r.price || r.pricing?.current_price || null,
      unit: r.unit || r.quantity || null,
      image: r.image || (Array.isArray(r.images) ? r.images[0] : null)
    }))
    return res.json({ results: simplified })
  } catch (e) {
    return res.status(500).json({ error: 'Search failed' })
  }
})

app.post('/picnic/add-ingredients', auth, async (req, res) => {
  const { ingredients } = req.body || {}
  if (!Array.isArray(ingredients)) return res.status(400).json({ error: 'ingredients array required' })
  const email = req.user.sub
  const user = users.get(email)
  if (!user || !user.picnic) return res.status(400).json({ error: 'Picnic credentials not set' })
  const { username, passwordEnc } = user.picnic
  const password = simpleXorDecrypt(passwordEnc, JWT_SECRET)

  try {
    const client = new PicnicClient()
    await client.login(username, password)

    let success = 0
    const failed = []
    for (const ing of ingredients) {
      try {
        // First check user mappings
        const searchKey = normalizeForSearch(ing.name)
        const mapping = users.get(email)?.mappings?.get?.(searchKey)
        if (mapping && mapping.productId) {
          try {
            await client.addProductToShoppingCart(String(mapping.productId), 1)
            success++
            await new Promise(r => setTimeout(r, 120))
            continue
          } catch {
            // Fall through to search if mapped product no longer valid
          }
        }

        const alternatives = generateSearchAlternatives(ing.name)
        let added = false
        for (const q of alternatives) {
          const results = await client.search(q)
          if (results && results.length > 0) {
            const product = results[0]
            await client.addProductToShoppingCart(String(product.id), 1)
            success++
            added = true
            break
          }
          await new Promise(r => setTimeout(r, 120))
        }
        if (!added) failed.push(ing.name)
        await new Promise(r => setTimeout(r, 150))
      } catch (e) {
        failed.push(ing.name)
      }
    }
    return res.json({ success, failed })
  } catch (e) {
    return res.status(500).json({ error: 'Picnic action failed' })
  }
})

const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})


