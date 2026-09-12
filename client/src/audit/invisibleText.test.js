import fs from 'fs';
import path from 'path';

/*
 * Issue #317: a figure that rendered, occupied space, appeared in innerText --
 * and was invisible.
 *
 * The pattern that does it is `-webkit-text-fill-color: transparent`, which
 * hands the painting of the glyphs over to `background-clip: text`. When that
 * works it is a gradient number. When the background is lost, the text is
 * painted with nothing.
 *
 * On APP ECOSYSTEM the background WAS lost, to a same-specificity rule in
 * another stylesheet, and the cascade resolves per property -- so the losing
 * rule still supplied the transparent fill while the winning one supplied a
 * flat pill. Nothing about the markup or the data was wrong, which is why it
 * survived review and a DOM-text check: reading innerText proves a value is
 * present, not that it can be seen.
 *
 * This pins the two halves of the lesson across every stylesheet, so the next
 * gradient number cannot reintroduce it quietly.
 */

const SRC = path.join(__dirname, '..');

function scssFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...scssFiles(full));
    else if (entry.name.endsWith('.scss')) out.push(full);
  }
  return out;
}

/*
 * Split a stylesheet into brace-balanced blocks, each paired with the selector
 * line that opened it. Crude, but it only has to be good enough to tell "these
 * two declarations are in the same block" -- which is the whole question.
 */
function blocks(source) {
  const found = [];
  const lines = source.split('\n');
  const stack = [];
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (opens > 0) {
      stack.push({ selector: line.trim().replace(/\{.*$/, '').trim(), body: [] });
    }
    for (const frame of stack) frame.body.push(line);
    for (let i = 0; i < closes; i += 1) {
      const done = stack.pop();
      if (done) found.push({ selector: done.selector, body: done.body.join('\n') });
    }
  }
  return found;
}

const files = scssFiles(SRC);

describe('no stylesheet can paint text with nothing (#317)', () => {
  it('finds stylesheets to check, so this cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('every transparent text fill has a gradient in the SAME block to paint it', () => {
    const offenders = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('text-fill-color')) continue;

      for (const block of blocks(source)) {
        // Only the transparent form is dangerous. `currentColor` and real
        // colours are fallbacks, not hand-offs.
        if (!/-webkit-text-fill-color:\s*transparent/.test(block.body)) continue;

        const paints =
          /background(-image)?:\s*[^;]*gradient/.test(block.body) &&
          /background-clip:\s*text/.test(block.body);

        if (!paints) {
          offenders.push(`${path.relative(SRC, file)} :: ${block.selector}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /*
   * The specificity half. A modifier written as `&--hero` compiles to a single
   * class, which ties its own base class -- and `.hov-header-badge` exists in
   * seven stylesheets loaded into one chunk, so "ties" means "whichever file
   * loads last wins". Chaining (`&.block--modifier`) is what makes the
   * modifier unconditionally win.
   */
  it('a gradient-painted modifier is chained onto its base class', () => {
    const unchained = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('text-fill-color')) continue;

      for (const block of blocks(source)) {
        if (!/-webkit-text-fill-color:\s*transparent/.test(block.body)) continue;

        // Walk out to the owning selector: a bare `&--modifier` anywhere in
        // this block's own selector chain is the hazard.
        const bareModifier = /(^|\s)&--[\w-]+\s*$/.test(block.selector);
        if (bareModifier) unchained.push(`${path.relative(SRC, file)} :: ${block.selector}`);
      }
    }

    expect(unchained).toEqual([]);
  });
});
