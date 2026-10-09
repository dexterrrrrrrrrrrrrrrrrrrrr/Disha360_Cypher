import { useEffect, useRef, useState } from 'react';
interface Recognition { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void }
interface SpeechWindow { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
export function useSpeech(onText: (text: string) => void) {
  const speechWindow = window as unknown as SpeechWindow;
  const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  const supported = !!Constructor; const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const [listening, setListening] = useState(false); const [error, setError] = useState(''); const [speaking, setSpeaking] = useState(false);
  const callback = useRef(onText); callback.current = onText; const recognition = useRef<Recognition | null>(null);
  useEffect(() => () => { if (recognition.current) { recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.onend = null; recognition.current.abort(); } if (canSpeak) window.speechSynthesis.cancel(); }, [canSpeak]);
  function dictate() { setError(''); if (!Constructor) { setError('Speech recognition is unavailable. Type your answer below.'); return; } if (listening) { recognition.current?.stop(); return; }
    const instance = new Constructor(); recognition.current = instance; instance.lang = 'en-IN'; instance.interimResults = false; instance.continuous = false;
    instance.onresult = e => { const text = Array.from(e.results).map(result => result[0]?.transcript || '').join(' ').trim(); if (text) callback.current(text); };
    instance.onerror = e => { setError(e.error === 'not-allowed' ? 'Microphone permission was denied. You can still type your answer.' : 'Voice recognition could not finish. Please type or try again.'); setListening(false); };
    instance.onend = () => setListening(false);
    try { instance.start(); setListening(true); } catch { setError('Could not start voice recognition. Please type your answer.'); setListening(false); }
  }
  function speak(text: string) { if (!canSpeak) return; window.speechSynthesis.cancel(); if (speaking) { setSpeaking(false); return; } const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-IN'; utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false); setSpeaking(true); window.speechSynthesis.speak(utterance); }
  function stop() { recognition.current?.stop(); if (canSpeak) window.speechSynthesis.cancel(); setSpeaking(false); }
  return { supported, canSpeak, listening, speaking, error, dictate, speak, stop };
}
