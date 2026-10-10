import { apiUrl } from './apiUrl';
export async function streamMentor(body: unknown, signal: AbortSignal, onChunk: (text: string) => void) {
  const response = await fetch(apiUrl('/api/v1/student/coding/mentor/stream'), { method: 'POST', credentials: 'include', signal, headers: { 'Content-Type': 'application/json', 'X-Disha360-Request': '1' }, body: JSON.stringify(body) });
  if (!response.ok) { let message = 'The coding mentor is unavailable. Please try again.'; try { message = (await response.json()).error?.message || message; } catch { /* Safe generic error. */ } throw new Error(message); }
  if (!response.body || !response.headers.get('Content-Type')?.includes('application/x-ndjson')) throw new Error('The server returned an unexpected response.');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '', text = '', bytes = 0, finished = false;
  try {
    while (true) {
      const part = await reader.read(); if (!part.done) { bytes += part.value.byteLength; if (bytes > 100000) throw new Error('The response exceeded its output limit.'); pending += decoder.decode(part.value, { stream: true }); } else pending += decoder.decode();
      const lines = pending.split('\n'); pending = lines.pop() ?? ''; if (part.done && pending) lines.push(pending);
      for (const line of lines.filter(l => l.trim())) {
        const event = JSON.parse(line); if (finished) throw new Error('Unexpected content after stream completion.');
        if (event.type === 'error') throw new Error('The AI response was interrupted. Partial guidance is incomplete; please retry.');
        if (event.type === 'done') { finished = true; continue; }
        if (event.type !== 'chunk' || typeof event.text !== 'string') throw new Error('Invalid AI stream.');
        text += event.text; if (text.length > 8000) throw new Error('The guidance exceeded its text limit.'); onChunk(text);
      }
      if (part.done) break;
    }
    if (!finished || !text.trim()) throw new Error('The AI response ended before completion. Please retry.');
    return text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
