import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { backendService } from '@/services/backendService'
import { useToast } from '@/hooks/use-toast'

interface PicnicCredentialsPanelProps {
  onConfigured: () => void
}

export function PicnicCredentialsPanel({ onConfigured }: PicnicCredentialsPanelProps) {
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const status = await backendService.getPicnicCredsStatus()
        if (!mounted) return
        setConfigured(status.configured)
        if (status.configured && status.username) setUsername(status.username)
      } catch {}
    })()
    return () => { mounted = false }
  }, [])

  const save = async () => {
    setLoading(true)
    try {
      await backendService.setPicnicCreds({ username, password })
      toast({ title: 'Opgeslagen', description: 'Picnic-gegevens opgeslagen' })
      setConfigured(true)
      onConfigured()
    } catch (e) {
      toast({ title: 'Fout', description: e instanceof Error ? e.message : 'Onbekende fout', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader>
        <CardTitle>Picnic-account koppelen</CardTitle>
        <CardDescription>Bewaar je Picnic-inlog. Wij gebruiken dit alleen server-side.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Picnic gebruikersnaam / email" value={username} onChange={e => setUsername(e.target.value)} disabled={loading} />
        <Input placeholder="Picnic wachtwoord" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
        <div className="flex gap-2">
          <Button onClick={save} disabled={loading || !username || !password}>
            {configured ? 'Wijzigingen opslaan' : 'Koppelen'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}


