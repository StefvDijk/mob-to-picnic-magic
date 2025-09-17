import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { backendService } from '@/services/backendService'
import { useToast } from '@/hooks/use-toast'

interface AuthPanelProps {
  onAuthenticated: () => void
}

export function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (mode: 'login' | 'register') => {
    setLoading(true)
    try {
      if (mode === 'register') {
        await backendService.register({ email, password })
        toast({ title: 'Account aangemaakt', description: 'Je kunt nu inloggen' })
      }
      await backendService.login({ email, password })
      toast({ title: 'Ingelogd', description: 'Je bent succesvol ingelogd' })
      onAuthenticated()
    } catch (e) {
      toast({ title: 'Fout', description: e instanceof Error ? e.message : 'Onbekende fout', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader>
        <CardTitle>Log in om te beginnen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input type="email" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} disabled={loading} />
        <Input type="password" placeholder="wachtwoord" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => handle('login')} disabled={loading || !email || !password}>Inloggen</Button>
          <Button className="flex-1" variant="outline" onClick={() => handle('register')} disabled={loading || !email || !password}>Registreren</Button>
        </div>
      </CardContent>
    </Card>
  )
}


