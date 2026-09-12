import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from 'donor/clipboard';

const FEEDBACK_MS = 1600;

/*
 * Click-to-copy state for a donation address (issue #294).
 *
 * Returns 'idle' | 'copied' | 'failed'. The failed state exists because the
 * copy genuinely can fail -- a blocked clipboard over plain http is the case
 * this was written for -- and the version this replaces reported that as
 * success, so the button said "Copied" and the user pasted whatever was in
 * their clipboard beforehand. A donation address is the last thing you want
 * someone to paste wrongly.
 *
 * The timer is cleared on unmount and before each new copy, so clicking twice
 * in quick succession cannot leave a stale 'copied' that outlives the second
 * click, and an unmount mid-feedback cannot set state on a dead component.
 */
export function useCopyAddress(address) {
  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const copy = useCallback(async () => {
    if (!address) return;
    clear();
    const ok = await copyTextToClipboard(address);
    setStatus(ok ? 'copied' : 'failed');
    timerRef.current = setTimeout(() => setStatus('idle'), FEEDBACK_MS);
  }, [address, clear]);

  return { status, copied: status === 'copied', failed: status === 'failed', copy };
}
