import { decodeTxNote, NOTE_MAX_CHARS } from './txNote';

/*
 * Issue #367. Donation notes ride as an OP_RETURN output. Fixtures use the
 * REAL asm shape and the real hex payloads read off the explorer on
 * 2026-09-16, so a change to the parser is checked against what the chain
 * actually returns rather than an idealised version of it.
 */
function txWithAsm(asm) {
  return {
    txid: 'a',
    vout: [
      { value: '10.0', scriptPubKey: { addresses: ['t3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'] } },
      { value: '0.0', scriptPubKey: { asm, addresses: null } }
    ]
  };
}

describe('decodeTxNote', () => {
  it('decodes a real note off the chain', () => {
    // tx 52cd7c6b… -> "2ndTL Flux Dashboard"
    const tx = txWithAsm('OP_RETURN 326e64544c20466c75782044617368626f617264');
    expect(decodeTxNote(tx)).toBe('2ndTL Flux Dashboard');
  });

  it('decodes the longest note on record intact', () => {
    // tx ee5c8f3b… is 80 bytes -- the OP_RETURN relay cap, so nothing on chain
    // can be longer and the cap must not clip a legitimate note.
    const hex =
      '5468616e6b20796f7520666f722074686973206772656174206461707020616e6420746865206861726420776f726b2067657474696e67206974206261636b20757020616e642072756e6e696e672121';
    const note = decodeTxNote(txWithAsm('OP_RETURN ' + hex));
    expect(note).toBe('Thank you for this great dapp and the hard work getting it back up and running!!');
    expect(note.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
  });

  it('returns null when there is no OP_RETURN output', () => {
    expect(decodeTxNote({ txid: 'a', vout: [{ value: '1', scriptPubKey: { addresses: ['t1x'] } }] })).toBeNull();
  });

  it('returns null for a payload that is not valid UTF-8', () => {
    // A binary protocol marker, not a message. Rendering it as mojibake would
    // put noise on the front page.
    expect(decodeTxNote(txWithAsm('OP_RETURN fffefdfc'))).toBeNull();
  });

  it('strips control characters and collapses whitespace', () => {
    // "a\n\n\tb" -> "a b"
    expect(decodeTxNote(txWithAsm('OP_RETURN 610a0a0962'))).toBe('a b');
  });

  it('strips DEL, which sits between the C0 and C1 ranges', () => {
    // 0x7F is not a C0 control and not a C1 control, so a class covering only
    // those two ranges lets it through onto the page.
    expect(decodeTxNote(txWithAsm('OP_RETURN 617f62'))).toBe('a b');
  });

  it('returns null for a payload that is only whitespace', () => {
    expect(decodeTxNote(txWithAsm('OP_RETURN 202020'))).toBeNull();
  });

  it('replaces a right-to-left override between words with a space', () => {
    // "hello" + U+202E (RIGHT-TO-LEFT OVERRIDE, UTF-8 e2 80 ae) + "world".
    // A bidi override can reverse or hide the text that follows it, so it must
    // be stripped like any other control character rather than rendered.
    expect(decodeTxNote(txWithAsm('OP_RETURN 68656c6c6fe280ae776f726c64'))).toBe('hello world');
  });

  it('returns null for a note made only of zero-width characters', () => {
    // Three U+200B ZERO WIDTH SPACE characters (UTF-8 e2 80 8b each). Rendered
    // as-is this is an invisible, non-empty string -- a blank cell instead of
    // the em-dash placeholder decodeTxNote's callers use for "no note".
    expect(decodeTxNote(txWithAsm('OP_RETURN e2808be2808be2808b'))).toBeNull();
  });

  it('returns null rather than throwing on malformed input', () => {
    expect(decodeTxNote(null)).toBeNull();
    expect(decodeTxNote({})).toBeNull();
    expect(decodeTxNote(txWithAsm('OP_RETURN'))).toBeNull();
    expect(decodeTxNote(txWithAsm('OP_RETURN zzzz'))).toBeNull();
  });

  it('reads a note already decoded onto the transaction by the cache trim', () => {
    // A warm cache read hands back {note} instead of a vout to parse.
    expect(decodeTxNote({ txid: 'a', note: 'thanks for the help', vout: [] })).toBe('thanks for the help');
  });
});
