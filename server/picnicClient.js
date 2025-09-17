import PicnicClient from 'picnic-api';
import { config } from './config.js';

const MOCK_PRODUCTS = [
  {
    id: 'mock-tofu-firm-400',
    name: 'Tofu naturel stevig 400g',
    brand: 'SoFine',
    isBio: true,
    unitSize: '400 g',
    priceEUR: '2.49',
    keywords: ['tofu', 'firm', 'naturel', 'soy'],
  },
  {
    id: 'mock-sugar-caster',
    name: 'Kristalsuiker 1kg',
    brand: 'Van Gilse',
    isBio: false,
    unitSize: '1 kg',
    priceEUR: '1.29',
    keywords: ['sugar', 'caster', 'kristalsuiker'],
  },
  {
    id: 'mock-syrup-golden',
    name: 'Golden syrup 454g',
    brand: 'Lyle\'s',
    isBio: false,
    unitSize: '454 g',
    priceEUR: '3.95',
    keywords: ['golden', 'syrup'],
  },
  {
    id: 'mock-pasta-penne',
    name: 'Penne pasta volkoren 500g',
    brand: 'Picnic',
    isBio: true,
    unitSize: '500 g',
    priceEUR: '1.05',
    keywords: ['pasta', 'penne', 'wholewheat', 'volkoren'],
  },
  {
    id: 'mock-butter-unsalted',
    name: 'Ongezouten roomboter 250g',
    brand: 'Campina',
    isBio: false,
    unitSize: '250 g',
    priceEUR: '2.19',
    keywords: ['butter', 'roomboter', 'unsalted'],
  },
];

function keywordScore(query, product, organicPreference) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const keywordSet = new Set(product.keywords.map((kw) => kw.toLowerCase()));
  let score = 0;

  for (const word of queryWords) {
    if (keywordSet.has(word)) {
      score += 2;
    } else if (product.name.toLowerCase().includes(word)) {
      score += 1;
    }
  }

  if (organicPreference != null) {
    if (organicPreference && product.isBio) score += 1.5;
    if (!organicPreference && !product.isBio) score += 0.5;
  }

  return score;
}

export class PicnicClientManager {
  constructor() {
    this.client = null;
    this.isAuthenticated = false;
    this.mockMode = false;
    this.mockCart = [];
    this.lastLogin = null;
  }

  async login(username, password) {
    const effectiveUsername = username || config.picnic.email;
    const effectivePassword = password || config.picnic.password;

    if (!effectiveUsername || !effectivePassword) {
      this.enableMockMode('No Picnic credentials provided. Running in mock mode.');
      return { success: true, mode: 'mock' };
    }

    try {
      this.client = new PicnicClient();
      await this.client.login(effectiveUsername, effectivePassword);
      this.isAuthenticated = true;
      this.mockMode = false;
      this.lastLogin = Date.now();
      return { success: true, mode: 'live' };
    } catch (error) {
      console.error('Picnic login failed, enabling mock mode:', error.message || error);
      this.enableMockMode('Login failed, switched to mock mode.');
      return { success: false, mode: 'mock', error: error.message || String(error) };
    }
  }

  enableMockMode(reason) {
    this.client = null;
    this.isAuthenticated = true; // treat mock as authenticated for flow control
    this.mockMode = true;
    this.mockCart = [];
    this.lastLogin = Date.now();
    if (reason) {
      console.warn(reason);
    }
  }

  logout() {
    this.client = null;
    this.isAuthenticated = false;
    this.mockMode = false;
    this.mockCart = [];
    this.lastLogin = null;
  }

  async ensureLoggedIn() {
    if (this.isAuthenticated) {
      return true;
    }
    const { success } = await this.login();
    return success;
  }

  async searchProducts(query, options = {}) {
    if (!query) return [];

    if (!(await this.ensureLoggedIn())) {
      return [];
    }

    if (this.mockMode) {
      return this.searchMockProducts(query, options).slice(0, options.limit || 10);
    }

    try {
      const results = await this.client.search(query);
      if (!Array.isArray(results)) {
        return [];
      }
      return results.map((product) => this.mapProduct(product)).slice(0, options.limit || 10);
    } catch (error) {
      console.error('Picnic search failed, using mock results:', error.message || error);
      return this.searchMockProducts(query, options).slice(0, options.limit || 10);
    }
  }

  mapProduct(product) {
    return {
      id: String(product.id),
      name: product.name,
      brand: product.brand || null,
      isBio: Boolean(product.is_bio ?? product.isBio ?? false),
      unitSize: product.unit_size || product.unitSize || null,
      priceEUR: product.price ? (product.price / 100).toFixed(2) : product.priceEUR || null,
    };
  }

  searchMockProducts(query, options = {}) {
    const organicPreference = options.organic;
    const scored = MOCK_PRODUCTS.map((product) => ({
      product,
      score: keywordScore(query, product, organicPreference),
    }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ product }) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      isBio: product.isBio,
      unitSize: product.unitSize,
      priceEUR: product.priceEUR,
    }));
  }

  async addToCart(productId, quantity = 1) {
    if (!(await this.ensureLoggedIn())) {
      return false;
    }

    if (this.mockMode) {
      this.mockCart.push({ productId, quantity, addedAt: Date.now() });
      return true;
    }

    try {
      await this.client.addProductToShoppingCart(productId, quantity);
      return true;
    } catch (error) {
      console.error('Failed to add product to Picnic cart:', error.message || error);
      return false;
    }
  }

  getStatus() {
    return {
      authenticated: this.isAuthenticated,
      mode: this.mockMode ? 'mock' : 'live',
      lastLogin: this.lastLogin,
      cartItems: this.mockCart,
    };
  }
}

export const picnicClientManager = new PicnicClientManager();
