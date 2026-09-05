import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * OPTIONAL server-side fallback for text translation, used only in the Vercel
 * (non-static-export) build. The primary path is fully client-side: the
 * browser calls Gemini/Groq/OpenAI directly with the user's own key so it
 * never reaches this server. This route exists for edge cases where a
 * provider's CORS policy blocks direct browser calls — the client may opt
 * into routing through here instead. The key is forwarded per-request only;
 * it is never written to disk, a database, or a log.
 */

interface TranslateRequestBody {
  provider: 'gemini' | 'groq' | 'openai';
  apiKey: string;
  text: string;
  targetLanguage: string;
}

export async function POST(req: NextRequest) {
  let body: TranslateRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { provider, apiKey, text, targetLanguage } = body;
  if (!provider || !apiKey || !text || !targetLanguage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: `Translate the user's message into the language with code "${targetLanguage}". Reply with ONLY the translated text.`,
            },
            { role: 'user', content: text },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) return NextResponse.json({ error: json }, { status: res.status });
      return NextResponse.json({ translatedText: json.choices?.[0]?.message?.content?.trim() ?? '' });
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: `Translate the user's message into the language with code "${targetLanguage}". Reply with ONLY the translated text.`,
            },
            { role: 'user', content: text },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) return NextResponse.json({ error: json }, { status: res.status });
      return NextResponse.json({ translatedText: json.choices?.[0]?.message?.content?.trim() ?? '' });
    }

    // gemini
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Translate the following text into the language with code "${targetLanguage}". Reply with ONLY the translated text.\n\n${text}`,
                },
              ],
            },
          ],
        }),
      }
    );
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ error: json }, { status: res.status });
    const translatedText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    return NextResponse.json({ translatedText });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown server error' },
      { status: 500 }
    );
  }
}
