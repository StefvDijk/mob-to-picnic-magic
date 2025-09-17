import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { backendService } from '@/services/backendService'
import { useToast } from '@/hooks/use-toast'

interface UnmatchedMapperProps {
  unmatched: string[]
  onSaved?: () => void
}

export function UnmatchedMapper({ unmatched, onSaved }: UnmatchedMapperProps) {
  const { toast } = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; price?: number; unit?: string; image?: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selected && unmatched.length > 0) setSelected(unmatched[0])
  }, [unmatched, selected])

  useEffect(() => {
    if (!query || !selected) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const { results } = await backendService.searchPicnic(query)
        if (!cancelled) setResults(results)
      } catch (e) {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [query, selected])

  const remaining = useMemo(() => unmatched.filter(u => u !== selected), [unmatched, selected])

  const save = async (productId: string, productLabel?: string) => {
    if (!selected) return
    try {
      await backendService.saveMapping(selected, productId, productLabel)
      toast({ title: 'Gekoppeld', description: `${selected} → ${productLabel || productId}` })
      const next = remaining[0] || null
      setSelected(next)
      setQuery('')
      setResults([])
      onSaved?.()
    } catch (e) {
      toast({ title: 'Opslaan mislukt', description: e instanceof Error ? e.message : 'Onbekende fout', variant: 'destructive' })
    }
  }

  if (unmatched.length === 0) return null

  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader>
        <CardTitle>Niet-gevonden ingrediënten koppelen</CardTitle>
        <CardDescription>Kies een ingrediënt en zoek een Picnic product om te onthouden</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {unmatched.map(u => (
            <Button key={u} variant={u === selected ? 'default' : 'outline'} size="sm" onClick={() => { setSelected(u); setQuery(u) }}>
              {u}
            </Button>
          ))}
        </div>

        {selected && (
          <div className="space-y-3">
            <Input placeholder="Zoek op Picnic" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loading && <div className="text-sm text-muted-foreground">Zoeken...</div>}
              {!loading && results.length === 0 && query && (
                <div className="text-sm text-muted-foreground">Geen resultaten</div>
              )}
              {results.map(r => (
                <div key={r.id} className="p-3 border rounded-md flex items-center gap-3">
                  {r.image && <img src={r.image} alt="" className="w-12 h-12 object-cover rounded" />}
                  <div className="flex-1">
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.unit || ''} {r.price ? `· €${(r.price/100).toFixed(2)}` : ''}</div>
                  </div>
                  <Button size="sm" onClick={() => save(r.id, r.name)}>Koppelen</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


