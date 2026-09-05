import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * OPTIONAL server-side TTS fallback (Vercel build only). The app's default
 * "read aloud" / auto-playback is 100% client-side via the Web Speech API
 * (see src/lib/tts.ts) and needs no server round trip or API key at all.
 * This route is for users who want higher-quality neural voices: pass an
 * OpenAI key (per-request, never stored) and get back an MP3 stream from
 * OpenAI's TTS endpoint.
 */

interface TTSRequestBody {
  apiKey: string;
  text: string;
  voice?: string; // e.g. 'alloy', 'verse', 'shimmer'
}

export async function POST(req: NextRequest) {
  let body: TTSRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { apiKey, text, voice = 'alloy' } = body;
  if (!apiKey || !text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice, input: text, response_format: 'mp3' }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return NextResponse.json({ error: errJson }, { status: res.status });
    }

    return new NextResponse(res.body, {
      headers: { 'Content-Type': 'audio/mpeg' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown server error' },
      { status: 500 }
    );
  }
}
