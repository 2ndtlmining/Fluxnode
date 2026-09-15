/*
 * The note a donor attached to their transaction (issue #367).
 *
 * Notes ride as an OP_RETURN output: a zero-value vout whose scriptPubKey has
 * no addresses and whose asm reads `OP_RETURN <hex>`.
 *
 * PARSE asm, NOT hex. The hex field is the whole script including its push
 * opcode, and the opcode varies with length -- 6a13 (direct push, 19 bytes),
 * 6a47 (71 bytes), 6a4c50 (OP_PUSHDATA1, 80 bytes) were all observed in the
 * ten real notes on record. asm has already split the pushed data out, so
 * reading it costs no opcode decoder and cannot get the boundary wrong.
 *
 * WHAT IS REFUSED, and why this is stricter than it looks. A note is text a
 * stranger chose to publish on the project's landing page: buildDonationRows
 * applies no minimum amount, so dust buys a row. Everything on record is
 * benign and the feature is the point of the issue, so notes are shown -- but
 * anything that is not valid UTF-8, anything carrying control characters, and
 * anything longer than the relay cap is refused or cleaned on the way in. If
 * a note is ever abused rather than merely malformed, the levers are a
 * minimum-amount threshold here or a blocklist; neither is built, because
 * neither is needed yet.
 */

/*
 * The OP_RETURN relay cap on this chain, and so the longest note that can
 * exist. The longest on record is exactly 80 bytes, which is why this is a
 * guard against a malformed payload rather than a display truncation -- the
 * column does its own ellipsis in CSS.
 */
export const NOTE_MAX_CHARS = 80;

/*
 * Hex -> string via percent-decoding, which is a UTF-8 decoder every engine
 * already has. Deliberately NOT TextDecoder: jsdom does not expose it under
 * Jest, and a note parser that works in the browser but not in tests is worse
 * than one that is slightly unusual. decodeURIComponent throws URIError on
 * invalid UTF-8, which is exactly the rejection wanted.
 */
function hexToUtf8(hex) {
  if (typeof hex !== 'string' || hex.length === 0) return null;
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    return decodeURIComponent(hex.replace(/../g, '%$&'));
  } catch {
    // Not valid UTF-8 -- a binary payload, not a message.
    return null;
  }
}

/** Printable, single-spaced, and no longer than the chain allows. */
function sanitise(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text
    // C0 and C1 control characters, plus the replacement character a partial
    // decode can leave behind.
    .replace(/[\x00-\x1F\x7F-\x9F\uFFFD]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, NOTE_MAX_CHARS);
}

/**
 * The note on this transaction, or null when it has none.
 *
 * Accepts both shapes a caller can hold: a raw explorer transaction, and a
 * trimmed one from the persisted scan, which stores the note already decoded
 * (api/donationScanCache.js) because keeping the script to re-parse would cost
 * the cache far more than the 80 bytes of text.
 *
 * @param {object} tx
 * @returns {string|null}
 */
export function decodeTxNote(tx) {
  if (!tx) return null;

  // Already decoded by the cache trim.
  if (typeof tx.note === 'string') return sanitise(tx.note);

  for (const out of tx.vout || []) {
    const asm = out?.scriptPubKey?.asm;
    if (typeof asm !== 'string' || !asm.startsWith('OP_RETURN')) continue;

    const parts = asm.split(/\s+/);
    if (parts.length < 2) continue;

    const text = hexToUtf8(parts[1]);
    const note = sanitise(text);
    if (note) return note;
  }

  return null;
}
