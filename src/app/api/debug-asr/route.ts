// TEMPORARY diagnostic route (removed right after use): compares Gemini audio
// transcription vs Groq Whisper (language-pinned) on the same clip.
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;

const TOKEN = 'dbg-7f3a91c2e5b84d06';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.token !== TOKEN) return NextResponse.json({ error: 'no' }, { status: 403 });
    const { audioBase64, mimeType, lang } = body as { audioBase64: string; mimeType: string; lang: 'fa' | 'tr' };
    const gKeys = (process.env.GEMINI_API_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const qKeys = (process.env.GROQ_API_KEYS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const langName = lang === 'fa' ? 'Persian' : 'Turkish';
    const out: Record<string, unknown> = {};

    for (const model of ['gemini-2.5-flash', 'gemini-flash-latest']) {
      for (const key of gKeys) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [
              { text: `Transcribe this ${langName} speech verbatim in ${langName} script. Output ONLY the transcript text. If there is no clear speech output nothing.` },
              { inlineData: { mimeType, data: audioBase64 } } ] }],
            generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
          }),
        });
        const j = await r.json().catch(() => ({}));
        const t = j?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (r.ok && typeof t === 'string') { out[`gemini:${model}`] = t.trim(); break; }
        out[`gemini:${model}:err`] = `${r.status} ${String(j?.error?.message ?? '').slice(0, 80)}`;
      }
    }

    const bytes = Buffer.from(audioBase64, 'base64');
    for (const wm of ['whisper-large-v3', 'whisper-large-v3-turbo']) {
      for (const key of qKeys) {
        const form = new FormData();
        form.append('file', new File([bytes], 'a.mp3', { type: mimeType }));
        form.append('model', wm);
        form.append('language', lang);
        form.append('response_format', 'verbose_json');
        form.append('temperature', '0');
        const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          out[`groq:${wm}`] = j.text;
          out[`groq:${wm}:segs`] = (j.segments ?? []).map((s: any) => ({ nsp: +(s.no_speech_prob ?? 0).toFixed(2), lp: +(s.avg_logprob ?? 0).toFixed(2) }));
          break;
        }
        out[`groq:${wm}:err`] = `${r.status} ${JSON.stringify(j).slice(0, 80)}`;
      }
    }
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
