import fs from 'fs';
import path from 'path';

/*
 * Guards the fix for the Analytics dark-mode bug (todo.md item 8).
 *
 * Root cause, established 2026-09-11: `body` hardcoded `background-color:
 * #ffffff` with no dark-mode override, and the global `.App` rule set layout
 * only -- no background at all. The ONLY rules painting `.App` lived in two
 * PAGE stylesheets, `home/Home.scss` and `main/MainApp.scss`. Those ship in
 * per-route lazy chunks, so whether `/analytics` had a dark background
 * depended on whether the user had previously visited `/home` or `/nodes` in
 * the same session -- lazy CSS chunks persist once loaded. Landing on
 * `/analytics` directly in dark mode left `--text-primary: #ededef`
 * (near-white) painted over `body`'s `#ffffff`.
 *
 * That navigation-dependence is why the bug read as an intermittent
 * "transition-timing artifact" for so long and was never root-caused.
 *
 * These are source-level assertions rather than rendered-DOM ones on purpose:
 * jsdom does not resolve CSS custom properties across a cascade, and the real
 * failure was a MISSING rule, which no amount of rendering can surface. The
 * complementary check is a grep of the BUILT css chunk -- see the fix's
 * commit message.
 */

const GLOBAL_SCSS = fs.readFileSync(path.join(__dirname, '_global.scss'), 'utf8');

// Grabs a top-level rule's body by selector, e.g. "body" or ".App".
function ruleBody(scss, selector) {
  // Anchored at line start so `.App` does not also match `.App-header` etc.
  const re = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = scss.match(re);
  return match ? match[1] : null;
}

describe('global background tokens (Analytics dark-mode regression guard)', () => {
  it('body sets a background-color', () => {
    const body = ruleBody(GLOBAL_SCSS, 'body');
    expect(body).not.toBeNull();
    expect(body).toMatch(/background-color\s*:/);
  });

  it('body background-color is token-driven, not a hardcoded hex', () => {
    // A literal hex here cannot follow the theme -- that was the bug.
    const body = ruleBody(GLOBAL_SCSS, 'body');
    const decl = body.match(/background-color\s*:\s*([^;]+);/);
    expect(decl).not.toBeNull();
    expect(decl[1].trim()).toMatch(/^var\(--/);
  });

  it('.App sets a background-color globally, so every route is painted', () => {
    // The bug: this rule existed but set layout only, leaving /analytics and
    // /live dependent on another route's lazy chunk having been loaded.
    const app = ruleBody(GLOBAL_SCSS, '.App');
    expect(app).not.toBeNull();
    expect(app).toMatch(/background-color\s*:/);
  });

  it('.App background-color is token-driven, not a hardcoded hex', () => {
    const app = ruleBody(GLOBAL_SCSS, '.App');
    const decl = app.match(/background-color\s*:\s*([^;]+);/);
    expect(decl).not.toBeNull();
    expect(decl[1].trim()).toMatch(/^var\(--/);
  });

  it('the token .App uses is genuinely redefined under .app-mode-dark', () => {
    // A token-driven background is only a fix if that token actually has a
    // dark value. --surface-secondary must appear in BOTH :root and the
    // .app-mode-dark block, or the page stays light in dark mode.
    const app = ruleBody(GLOBAL_SCSS, '.App');
    const token = app.match(/background-color\s*:\s*var\((--[a-z-]+)\)/)[1];

    const darkBlock = GLOBAL_SCSS.match(/\.app-mode-dark\s*\{([\s\S]*?)\n\}/);
    expect(darkBlock).not.toBeNull();
    expect(darkBlock[1]).toContain(`${token}:`);
  });

  it('no page stylesheet paints a bare .App background any more', () => {
    // Home.scss and MainApp.scss each used to define a top-level `.App`
    // background. Page-scoped stylesheets reaching up to paint a shared
    // global ancestor, in separately-loaded chunks, IS the bug class -- the
    // same one as the duplicated unscoped `hov-*` selectors.
    // Home may still layer a background-IMAGE (its dot pattern); only a
    // background-COLOR on a bare `.App` is forbidden.
    const pageStylesheets = [
      path.join(__dirname, '..', 'home', 'Home.scss'),
      path.join(__dirname, '..', 'main', 'MainApp.scss'),
    ];

    for (const file of pageStylesheets) {
      const body = ruleBody(fs.readFileSync(file, 'utf8'), '.App');
      if (body === null) continue; // rule removed entirely -- ideal
      expect(body).not.toMatch(/background-color\s*:/);
    }
  });
});
