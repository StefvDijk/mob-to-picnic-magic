import { Ingredient } from './picnicService';

export interface Recipe {
  title: string;
  description: string;
  ingredients: Ingredient[];
  instructions: string[];
  servings?: number;
  cookingTime?: string;
  imageUrl?: string;
}

class RecipeService {
  async fetchRecipe(url: string): Promise<Recipe> {
    if (!url.includes('mob.co.uk')) {
      throw new Error('Only mob.co.uk recipes are supported');
    }

    try {
      // For now, we'll use a CORS proxy to fetch the page content
      // In a production environment, you'd want to use your own backend
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      const data = await response.json();
      
      if (!data.contents) {
        throw new Error('Failed to fetch recipe content');
      }

      const htmlContent = data.contents;
      return this.parseRecipeFromHtml(htmlContent, url);
    } catch (error) {
      console.error('Failed to fetch recipe:', error);
      throw new Error('Failed to fetch recipe. Please check the URL and try again.');
    }
  }

  private parseRecipeFromHtml(html: string, url: string): Recipe {
    // Create a temporary DOM element to parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try to extract recipe data from mob.co.uk structure
    const title = this.extractTitle(doc);
    const description = this.extractDescription(doc);
    const ingredients = this.extractIngredients(doc);
    const instructions = this.extractInstructions(doc);
    const imageUrl = this.extractImageUrl(doc, url);

    return {
      title,
      description,
      ingredients,
      instructions,
      imageUrl,
    };
  }

  private extractTitle(doc: Document): string {
    // Try various selectors commonly used for recipe titles
    const selectors = [
      'h1',
      '.recipe-title',
      '[data-testid="recipe-title"]',
      '.post-title',
      '.entry-title'
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element && element.textContent?.trim()) {
        return element.textContent.trim();
      }
    }

    return 'Recipe from mob.co.uk';
  }

  private extractDescription(doc: Document): string {
    const selectors = [
      '.recipe-description',
      '.post-content p:first-of-type',
      '.entry-content p:first-of-type',
      'meta[name="description"]'
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const content = selector.includes('meta') 
          ? element.getAttribute('content')
          : element.textContent;
        
        if (content?.trim()) {
          return content.trim();
        }
      }
    }

    return 'A delicious recipe from mob.co.uk';
  }

  private extractIngredients(doc: Document): Ingredient[] {
    const ingredients: Ingredient[] = [];
    
    // Try various selectors for ingredients
    const selectors = [
      '.ingredients li',
      '.recipe-ingredients li',
      '[data-testid="ingredients"] li',
      '.wp-block-group__inner-container li'
    ];

    for (const selector of selectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(element => {
          const text = element.textContent?.trim();
          if (text) {
            const parsed = this.parseIngredient(text);
            if (parsed.name) {
              ingredients.push(parsed);
            }
          }
        });
        break; // Use the first successful selector
      }
    }

    // If no structured ingredients found, try to extract from text
    if (ingredients.length === 0) {
      const textContent = doc.body.textContent || '';
      const lines = textContent.split('\n');
      
      // Look for ingredient-like lines (containing common units or patterns)
      const ingredientPattern = /\d+.*?(gram|kg|ml|liter|cup|tbsp|tsp|piece|slice)/i;
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && (ingredientPattern.test(trimmed) || trimmed.length < 50)) {
          const parsed = this.parseIngredient(trimmed);
          if (parsed.name && !ingredients.some(ing => ing.name === parsed.name)) {
            ingredients.push(parsed);
          }
        }
      });
    }

    return ingredients.slice(0, 20); // Limit to 20 ingredients max
  }

  private parseIngredient(text: string): Ingredient {
    // Simple ingredient parsing - can be improved
    const quantityMatch = text.match(/^(\d+(?:\.\d+)?)\s*(\w+)?\s+(.+)$/);
    
    if (quantityMatch) {
      return {
        quantity: quantityMatch[1],
        unit: quantityMatch[2] || '',
        name: quantityMatch[3].trim()
      };
    }

    // If no quantity pattern found, treat the whole text as name
    return {
      name: text.replace(/^[-•]\s*/, '').trim() // Remove bullet points
    };
  }

  private extractInstructions(doc: Document): string[] {
    const instructions: string[] = [];
    
    const selectors = [
      '.instructions li',
      '.recipe-instructions li',
      '.method li',
      '[data-testid="instructions"] li',
      '.directions li'
    ];

    for (const selector of selectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((element, index) => {
          const text = element.textContent?.trim();
          if (text) {
            instructions.push(`${index + 1}. ${text}`);
          }
        });
        break;
      }
    }

    return instructions;
  }

  private extractImageUrl(doc: Document, baseUrl: string): string | undefined {
    const selectors = [
      '.recipe-image img',
      '.post-thumbnail img',
      '.featured-image img',
      'meta[property="og:image"]',
      '.wp-post-image'
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        let src = selector.includes('meta') 
          ? element.getAttribute('content')
          : element.getAttribute('src');
        
        if (src) {
          // Handle relative URLs
          if (src.startsWith('/')) {
            const url = new URL(baseUrl);
            src = `${url.protocol}//${url.host}${src}`;
          }
          return src;
        }
      }
    }

    return undefined;
  }
}

export const recipeService = new RecipeService();