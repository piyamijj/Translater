'use client';

import { useState } from 'react';
import { Settings, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePolyGlotStore, type AIProviderId } from '@/lib/store';

const PROVIDERS: { id: AIProviderId; label: string; helpUrl: string }[] = [
  { id: 'gemini', label: 'Google Gemini', helpUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq', label: 'Groq', helpUrl: 'https://console.groq.com/keys' },
  { id: 'openai', label: 'OpenAI', helpUrl: 'https://platform.openai.com/api-keys' },
];

function ApiKeyField({ provider, label, helpUrl }: { provider: AIProviderId; label: string; helpUrl: string }) {
  const value = usePolyGlotStore((s) => s.apiKeys[provider]);
  const setApiKey = usePolyGlotStore((s) => s.setApiKey);
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={`key-${provider}`}>{label}</Label>
        <a
          href={helpUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Anahtar al
        </a>
      </div>
      <div className="relative">
        <Input
          id={`key-${provider}`}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          placeholder={`${label} API anahtarınızı yapıştırın`}
          value={value}
          onChange={(e) => setApiKey(provider, e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function SettingsModal() {
  const activeProvider = usePolyGlotStore((s) => s.activeProvider);
  const setActiveProvider = usePolyGlotStore((s) => s.setActiveProvider);
  const captureMode = usePolyGlotStore((s) => s.captureMode);
  const setCaptureMode = usePolyGlotStore((s) => s.setCaptureMode);
  const ttsEnabled = usePolyGlotStore((s) => s.ttsEnabled);
  const setTtsEnabled = usePolyGlotStore((s) => s.setTtsEnabled);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ayarlar">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ayarlar</DialogTitle>
          <DialogDescription>
            Uygulama hiçbir ayar yapılmadan çalışır. Aşağıdakiler yalnızca isteğe bağlı
            gelişmiş tercihlerdir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p>
              Uygulama, kurulumu tamamen size ait olan varsayılan bir AI yapılandırmasıyla
              gelir — hiçbir şey girmenize gerek yok. Kendi API anahtarınızı girmek
              isterseniz (isteğe bağlı), bu anahtar yalnızca bu tarayıcının yerel depolama
              alanında saklanır ve doğrudan ilgili sağlayıcının kendi API&apos;sine
              gönderilir; hiçbir zaman kaydedilmez veya başka bir sunucuya iletilmez.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">AI Sağlayıcıları (isteğe bağlı)</h3>
            {PROVIDERS.map((p) => (
              <ApiKeyField key={p.id} provider={p.id} label={p.label} helpUrl={p.helpUrl} />
            ))}

            <div className="space-y-1.5">
              <Label>Tercih edilen sağlayıcı</Label>
              <div className="flex gap-2">
                {PROVIDERS.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    size="sm"
                    variant={activeProvider === p.id ? 'default' : 'outline'}
                    onClick={() => setActiveProvider(p.id)}
                  >
                    {p.label.split(' ')[0]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Bu sağlayıcı başarısız olursa, uygulama otomatik olarak anahtar tanımladığınız
                başka bir sağlayıcıya geçer.
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Kayıt modu</h3>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={captureMode === 'push-to-talk' ? 'default' : 'outline'}
                onClick={() => setCaptureMode('push-to-talk')}
              >
                Bas-konuş
              </Button>
              <Button
                type="button"
                size="sm"
                variant={captureMode === 'continuous' ? 'default' : 'outline'}
                onClick={() => setCaptureMode('continuous')}
              >
                Sürekli (eller serbest)
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <Label htmlFor="tts-toggle">Çevirileri sesli oku</Label>
              <p className="text-xs text-muted-foreground">
                Çevrilen metni otomatik olarak sesli okuma ile oynatır.
              </p>
            </div>
            <Switch id="tts-toggle" checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
