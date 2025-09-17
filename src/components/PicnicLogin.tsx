import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ShoppingCart, Eye, EyeOff } from 'lucide-react';
import { PicnicCredentials } from '@/services/picnicService';

interface PicnicLoginProps {
  onLogin: (credentials: PicnicCredentials) => void;
  isLoading: boolean;
}

export function PicnicLogin({ onLogin, isLoading }: PicnicLoginProps) {
  const [credentials, setCredentials] = useState<PicnicCredentials>({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(credentials);
  };

  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl text-picnic-green">
          <ShoppingCart className="w-7 h-7" />
          Picnic Inloggen
        </CardTitle>
        <CardDescription className="text-lg">
          Log in met je Picnic account om ingrediënten toe te voegen
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Email / Gebruikersnaam</Label>
            <Input
              id="username"
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              placeholder="je.email@example.com"
              disabled={isLoading}
              className="h-11"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Wachtwoord</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                placeholder="••••••••"
                disabled={isLoading}
                className="h-11 pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <Button
            type="submit"
            variant="picnic"
            size="lg"
            className="w-full text-lg h-12"
            disabled={isLoading || !credentials.username || !credentials.password}
          >
            {isLoading ? 'Inloggen...' : 'Inloggen bij Picnic'}
          </Button>
        </form>
        <p className="text-sm text-muted-foreground mt-4 text-center">
          Je inloggegevens worden veilig gebruikt om verbinding te maken met Picnic
        </p>
      </CardContent>
    </Card>
  );
}