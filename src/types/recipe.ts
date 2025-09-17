import { Ingredient } from '@/services/picnicService'

export interface Recipe {
  title: string
  description: string
  ingredients: Ingredient[]
  instructions: string[]
  servings?: number
  cookingTime?: string
  imageUrl?: string
}


