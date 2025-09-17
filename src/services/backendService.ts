export interface Credentials {
  email: string
  password: string
}

export interface PicnicCreds {
  username: string
  password: string
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

class BackendService {
  private tokenKey = 'auth_token'

  get token(): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(this.tokenKey) : null
  }

  set token(value: string | null) {
    if (typeof localStorage === 'undefined') return
    if (value) localStorage.setItem(this.tokenKey, value)
    else localStorage.removeItem(this.tokenKey)
  }

  isLoggedIn(): boolean {
    return !!this.token
  }

  async register(data: Credentials): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, name: data.email, password: data.password })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Register failed')
    }
  }

  async login(data: Credentials): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    const body = await res.json()
    if (!res.ok || !body.token) {
      throw new Error(body.error || 'Login failed')
    }
    this.token = body.token
  }

  logout(): void {
    this.token = null
  }

  private authHeaders(): HeadersInit {
    return this.token ? { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  }

  async setPicnicCreds(creds: PicnicCreds): Promise<void> {
    const res = await fetch(`${API_BASE}/credentials/picnic`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(creds)
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Saving Picnic credentials failed')
    }
  }

  async getPicnicCredsStatus(): Promise<{ configured: boolean; username: string | null }> {
    const res = await fetch(`${API_BASE}/credentials/picnic`, { headers: this.authHeaders() })
    if (!res.ok) throw new Error('Failed to load Picnic credentials status')
    return res.json()
  }

  async addIngredients(ingredients: { name: string; quantity?: string; unit?: string }[]): Promise<{ success: number; failed: string[] }> {
    const res = await fetch(`${API_BASE}/picnic/add-ingredients`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ ingredients })
    })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(body.error || 'Adding ingredients failed')
    }
    return body
  }

  async listMappings(): Promise<{ mappings: { key: string; productId: string; productLabel?: string; updatedAt: number }[] }> {
    const res = await fetch(`${API_BASE}/mappings`, { headers: this.authHeaders() })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Failed to load mappings')
    return body
  }

  async saveMapping(sourceName: string, productId: string, productLabel?: string): Promise<void> {
    const res = await fetch(`${API_BASE}/mappings`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify({ sourceName, productId, productLabel })
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || 'Failed to save mapping')
  }

  async searchPicnic(q: string): Promise<{ results: { id: string; name: string; price?: number; unit?: string; image?: string }[] }> {
    const url = new URL(`${API_BASE}/picnic/search`)
    url.searchParams.set('q', q)
    const res = await fetch(url.toString(), { headers: this.authHeaders() })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Search failed')
    return body
  }
}

export const backendService = new BackendService()


