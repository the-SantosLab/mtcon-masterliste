import { useEffect, useRef, useState } from 'react';

/**
 * Animates incoming text token-by-token to simulate streaming.
 * Only animates messages that haven't been displayed before (cached in a ref).
 */
export function useTypewriter(messageId: string, fullText: string, speedMsPerChar = 12) {
  const seenRef = useRef<Set<string>>(new Set());
  const [shown, setShown] = useState(fullText);

  useEffect(() => {
    if (seenRef.current.has(messageId)) {
      setShown(fullText);
      return;
    }
    // mark seen immediately to avoid re-animating
    seenRef.current.add(messageId);
    setShown('');
    let i = 0;
    const step = Math.max(1, Math.ceil(fullText.length / 200)); // ensure animation stays under ~2.4s
    const timer = setInterval(() => {
      i = Math.min(fullText.length, i + step);
      setShown(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(timer);
    }, speedMsPerChar);
    return () => clearInterval(timer);
  }, [messageId, fullText, speedMsPerChar]);

  return shown;
}

/**
 * Module-level cache so the typewriter survives component re-mounts within a session.
 */
const sessionSeen = new Set<string>();

export function useTypewriterSession(messageId: string, fullText: string) {
  const [shown, setShown] = useState(() => (sessionSeen.has(messageId) ? fullText : ''));

  useEffect(() => {
    if (sessionSeen.has(messageId)) {
      setShown(fullText);
      return;
    }
    sessionSeen.add(messageId);
    let i = 0;
    const step = Math.max(1, Math.ceil(fullText.length / 180));
    const timer = setInterval(() => {
      i = Math.min(fullText.length, i + step);
      setShown(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(timer);
    }, 14);
    return () => clearInterval(timer);
  }, [messageId, fullText]);

  return shown;
}
