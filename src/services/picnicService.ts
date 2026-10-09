import PicnicClient from 'picnic-api';

const DEFAULT_DEV_API_PORT = 3000;

const isAbsoluteUrl = (url: string): boolean => /^https?:\/\//i.test(url);

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, '');

const normalizePath = (path: string): string => {
  if (!path) {
    return '';
  }

  return path.startsWith('/') ? path : `/${path}`;
};

const resolveDevBaseUrl = (): string => {
  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_DEV_API_PORT}`;
  }

  const hostname = window.location?.hostname || 'localhost';
  return `http://${hostname}:${DEFAULT_DEV_API_PORT}`;
};

export const buildUrl = (path: string): string => {
  if (isAbsoluteUrl(path)) {
    return path;
  }

  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredBaseUrl) {
    return `${normalizeBaseUrl(configuredBaseUrl)}${normalizePath(path)}`;
  }

  if (import.meta.env.DEV) {
    return `${normalizeBaseUrl(resolveDevBaseUrl())}${normalizePath(path)}`;
  }

  return path;
};

export interface PicnicCredentials {
  username: string;
  password: string;
}

export interface Ingredient {
  name: string;
  quantity?: string;
  unit?: string;
}

class PicnicService {
  private client: InstanceType<typeof PicnicClient> | null = null;
  private isAuthenticated = false;

  async login(credentials: PicnicCredentials): Promise<boolean> {
    try {
      this.client = new PicnicClient();
      await this.client.login(credentials.username, credentials.password);
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.error('Picnic login failed:', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  async searchProduct(query: string): Promise<any[]> {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('Not authenticated with Picnic');
    }

    try {
      const results = await this.client.search(query);
      return results || [];
    } catch (error) {
      console.error('Product search failed:', error);
      return [];
    }
  }

  async addToBasket(productId: string, quantity: number = 1): Promise<boolean> {
    if (!this.client || !this.isAuthenticated) {
      throw new Error('Not authenticated with Picnic');
    }

    try {
      await this.client.addProductToShoppingCart(productId, quantity);
      return true;
    } catch (error) {
      console.error('Failed to add product to basket:', error);
      return false;
    }
  }

  async addIngredientsToBasket(ingredients: Ingredient[]): Promise<{ success: number; failed: string[] }> {
    const results = { success: 0, failed: [] as string[] };

    for (const ingredient of ingredients) {
      try {
        const products = await this.searchProduct(ingredient.name);
        if (products.length > 0) {
          const product = products[0]; // Take the first (most relevant) result
          const success = await this.addToBasket(String(product.id), 1);
          if (success) {
            results.success++;
          } else {
            results.failed.push(ingredient.name);
          }
        } else {
          results.failed.push(ingredient.name);
        }
        
        // Add a small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to add ${ingredient.name}:`, error);
        results.failed.push(ingredient.name);
      }
    }

    return results;
  }

  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  logout(): void {
    this.client = null;
    this.isAuthenticated = false;
  }
}

export const picnicService = new PicnicService();
