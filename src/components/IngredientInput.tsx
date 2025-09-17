import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { backendService } from '@/services/backendService'
import { useToast } from '@/hooks/use-toast'

interface IngredientInputProps {
  onParsed: (ingredients: { name: string; quantity?: string; unit?: string }[]) => void
}

export function IngredientInput({ onParsed }: IngredientInputProps) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const parse = async () => {
    setLoading(true)
    try {
      const res = await fetch((import.meta.env.VITE_API_BASE || '/api') + '/parse-ingredients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(backendService.isLoggedIn() ? { Authorization: `Bearer ${backendService['token']}` } : {})
        },
        body: JSON.stringify({ text })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Parser error')
      onParsed(body.ingredients || [])
    } catch (e) {
      toast({ title: 'Fout bij parser', description: e instanceof Error ? e.message : 'Onbekende fout', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader>
        <CardTitle>Ingrediënten plakken</CardTitle>
        <CardDescription>Plaats een lijst (regels of komma’s). Voorbeeld: "2x tomaten, 200 g kipfilet"</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={text} onChange={e => setText(e.target.value)} placeholder={"2x tomaten\n200 g kipfilet\n1 ui"} rows={6} />
        <Button onClick={parse} disabled={loading || !text.trim()}>
          {loading ? 'Parsen...' : 'Ingrediënten parsen'}
        </Button>
      </CardContent>
    </Card>
  )
}


