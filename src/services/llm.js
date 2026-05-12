// ─────────────────────────────────────────────────────────────────
// LLM SERVICE — Groq (primary) → Gemini (fallback)
// To swap providers in future: edit this file only.
// ─────────────────────────────────────────────────────────────────

const GROQ_KEY   = import.meta.env.VITE_GROQ_API_KEY
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY

// ── Groq via OpenAI-compatible endpoint ──────────────────────────
async function callGroq(systemPrompt, history) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Groq error ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── Gemini Flash fallback ─────────────────────────────────────────
async function callGemini(systemPrompt, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 1000 },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini error ${res.status}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ── Public function — Groq first, Gemini on failure ───────────────
export async function callLLM(systemPrompt, history) {
  // Try Groq first
  if (GROQ_KEY) {
    try {
      const text = await callGroq(systemPrompt, history)
      if (text) return text
    } catch (err) {
      console.warn('Groq failed, falling back to Gemini:', err.message)
    }
  }

  // Fallback to Gemini
  if (GEMINI_KEY) {
    try {
      const text = await callGemini(systemPrompt, history)
      if (text) return text
    } catch (err) {
      console.warn('Gemini also failed:', err.message)
    }
  }

  throw new Error('All AI providers failed or no API keys set.')
}