import fs from 'fs';
import path from 'path';

/*
 * Issue #252 -- the Donor tab renders the VIEWER'S OWN wallet but labelled it
 * "HIS NODES" / "APPS ON HIS NODES" / "his nodes". Wrong on two counts: it is
 * the reader's own data, so the word is "your"; and it guessed a gender it has
 * no reason to know.
 *
 * Asserted against the source rather than a render, because the whole point is
 * that no future edit reintroduces a third-person pronoun in user-facing copy
 * anywhere in this file.
 */
describe('DonorTab user-facing copy', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.jsx'), 'utf8');

  it('addresses the reader directly rather than in the third person', () => {
    const pronouns = source.match(/\b(his|her|hers|he|she|him)\b/gi) || [];
    expect(pronouns).toEqual([]);
  });

  it('labels the panels as the reader\'s own', () => {
    expect(source).toContain('YOUR NODES');
    expect(source).toContain('APPS ON YOUR NODES');
  });
});
