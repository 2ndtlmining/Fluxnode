import { categorizeApp, categorizeAppSpec, isOpaqueRuntimeImage } from './appCategories';

/*
 * Every case below is taken from live Flux network data. The substring matcher
 * is easy to break by adding a short keyword, so these lock in both the
 * intended matches and the collisions that have already bitten us once.
 */

describe('categorizeApp — substring collision regressions', () => {
  it('does not put fulfillment-engine in AI via the "llm" in "fuLLMent"', () => {
    expect(categorizeApp('qblocktechnology/fulfillment-engine:latest')).not.toBe('ai');
  });

  it('still matches genuine LLM images', () => {
    expect(categorizeApp('ollama/ollama:latest')).toBe('ai');
    expect(categorizeApp('vllm/vllm-openai:latest')).toBe('ai');
    expect(categorizeApp('ghcr.io/ggerganov/llama.cpp:server')).toBe('ai');
  });

  it('does not put simplexchat in Media via the "plex" in "simPLEXchat"', () => {
    expect(categorizeApp('simplexchat/smp-server:latest')).toBe('communication');
    expect(categorizeApp('linuxserver/plex:latest')).toBe('media');
  });

  it('keeps flux-foundation-site in Blockchain rather than Web', () => {
    expect(categorizeApp('jefke/flux-foundation-site:latest')).toBe('blockchain');
  });
});

describe('categorizeApp — images that used to fall through to Other', () => {
  const cases = [
    ['ghcr.io/runonflux/cumulusvpn-gateway:0.3.0', 'vpn'],
    ['holdroot/proxymsg-agent:v1', 'vpn'],
    ['iproyal/pawns-cli:latest', 'vpn'],
    ['globalping/globalping-probe:latest', 'monitoring'],
    ['runonflux/flux-pg-cluster:latest', 'database'],
    ['soulmajor/gitliman-galera:v13', 'database'],
    ['runonflux/fironode:latest', 'blockchain'],
    ['runonflux/simplex-smp-server:latest', 'communication'],
    ['littlestache/pokerth:latest', 'gaming'],
    ['spritsail/fivem:latest', 'gaming'],
    ['runonflux/website:latest', 'web'],
    ['littlestache/privatebin:latest', 'web'],
    ['linuxserver/qbittorrent:latest', 'media'],
    ['doccano/doccano:latest', 'ai'],
    // Beldex master nodes — confirmed from the image labels, since the image
    // name itself gives no hint. See the comment in appCategories.js.
    ['ghcr.io/girderworks/feather:1.0.14', 'blockchain'],
    ['ghcr.io/girderworks/edge:1.0.13', 'blockchain'],
    ['beldex/beldex-master-node:latest', 'blockchain'],
  ];

  it.each(cases)('categorizes %s as %s', (image, expected) => {
    expect(categorizeApp(image)).toBe(expected);
  });
});

describe('categorizeApp — established categories still hold', () => {
  const cases = [
    ['yurinnick/folding-at-home:latest', 'computing'],
    ['thijsvanloef/palworld-server-docker:latest', 'gaming'],
    ['itzg/minecraft-server:latest', 'gaming'],
    ['siomiz/softethervpn:9799-alpine', 'vpn'],
    ['presearch/node:latest', 'vpn'],
    ['runonflux/blockbook-docker:latest', 'blockchain'],
    ['kaspanet/rusty-kaspad:latest', 'blockchain'],
    ['runonflux/shared-db:latest', 'database'],
    ['mysql:8.3.0', 'database'],
    ['runonflux/wp-nginx:latest', 'web'],
    ['streamr/node:latest', 'communication'],
    ['grafana/grafana:latest', 'monitoring'],
    ['n8nio/n8n:latest', 'devops'],
  ];

  it.each(cases)('keeps %s as %s', (image, expected) => {
    expect(categorizeApp(image)).toBe(expected);
  });

  it('returns other for genuinely unrecognised images', () => {
    expect(categorizeApp('busybox:latest')).toBe('other');
    expect(categorizeApp('alpine:latest')).toBe('other');
    expect(categorizeApp('')).toBe('other');
    expect(categorizeApp(null)).toBe('other');
    expect(categorizeApp(undefined)).toBe('other');
  });
});

describe('isOpaqueRuntimeImage', () => {
  it('flags the git deployment wrapper, which says nothing about the workload', () => {
    expect(isOpaqueRuntimeImage('runonflux/orbit:latest')).toBe(true);
  });

  it('does not flag ordinary images', () => {
    expect(isOpaqueRuntimeImage('runonflux/wp-nginx:latest')).toBe(false);
    expect(isOpaqueRuntimeImage('')).toBe(false);
  });

  it('no longer routes the orbit wrapper into DevOps by keyword', () => {
    expect(categorizeApp('runonflux/orbit:latest')).toBe('other');
  });
});

describe('categorizeAppSpec', () => {
  it('prefers the compose repotag over the user-chosen app name', () => {
    // Real spec: the name matches the blockchain keyword 'fluxcloud', but the
    // image is Folding@Home. The image must win.
    const spec = {
      name: 'FoldingAtFluxCloud1686325836978',
      compose: [{ repotag: 'yurinnick/folding-at-home:latest' }],
    };
    expect(categorizeAppSpec(spec)).toBe('computing');
  });

  it('scans every compose component, not just the first', () => {
    const spec = {
      name: 'somestack',
      compose: [
        { repotag: 'busybox:latest' },
        { repotag: 'kaspanet/rusty-kaspad:latest' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('blockchain');
  });

  it('buckets encrypted enterprise specs separately from Other', () => {
    const spec = { name: 'Fluxtracker', compose: [], enterprise: 'l/CKxfdabV5BoEG8...' };
    expect(categorizeAppSpec(spec)).toBe('enterprise');
  });

  it('does not treat a non-enterprise app with readable compose as enterprise', () => {
    const spec = { name: 'wp', compose: [{ repotag: 'runonflux/wp-nginx:latest' }] };
    expect(categorizeAppSpec(spec)).toBe('web');
  });

  it('falls back to the app name only when no repotag matches', () => {
    const spec = { name: 'my-minecraft-box', compose: [{ repotag: 'busybox:latest' }] };
    expect(categorizeAppSpec(spec)).toBe('gaming');
  });

  it('handles flat (non-compose) specs', () => {
    expect(categorizeAppSpec({ name: 'x', repotag: 'mysql:8.3.0' })).toBe('database');
  });

  it('handles missing and malformed specs without throwing', () => {
    expect(categorizeAppSpec(null)).toBe('other');
    expect(categorizeAppSpec({})).toBe('other');
    expect(categorizeAppSpec({ name: 'x', compose: null })).toBe('other');
  });
});

describe('dedicated websites are Web, never the app they advertise', () => {
  /*
   * Cross-checked against the Flux team's own tooling: Fluxtracker excludes
   * '-server-website' from category matching (it traced 47 phantom gaming
   * instances to this), and fluxview renamed its Gaming page to "Dedicated
   * Websites". Gaming totals here must agree with Fluxtracker's.
   */
  const siteCases = [
    'runonflux/minecraft-server-website:latest',
    'runonflux/palworld-server-website:latest',
    'runonflux/valheim-server-website:latest',
    'runonflux/enshrouded-server-website:latest',
    'runonflux/project-zomboid-server-website:latest',
    'runonflux/fivem-server-website:latest',
    'runonflux/rust-server-website:latest',
    'runonflux/windrose-server-website:latest',
    'runonflux/openclaw-website:latest',
    'runonflux/hermes-website:latest',
    'runonflux/n8n-website:latest',
    'runonflux/website:latest',
  ];

  it.each(siteCases)('%s is web', (image) => {
    expect(categorizeApp(image)).toBe('web');
  });

  it('still categorizes the actual game server behind the website', () => {
    expect(categorizeApp('itzg/minecraft-server:latest')).toBe('gaming');
    expect(categorizeApp('thijsvanloef/palworld-server-docker:latest')).toBe('gaming');
    expect(categorizeApp('lloesche/valheim-server:latest')).toBe('gaming');
  });
});

describe('game servers tracked by fluxview / Fluxtracker', () => {
  const cases = [
    ['littlestache/abioticfactorserver:latest', 'gaming'],
    ['rouhim/arma-reforger-server:latest', 'gaming'],
    ['kagurazakanyaa/soulmask:latest', 'gaming'],
    ['indifferentbroccoli/windrose-server-docker:latest', 'gaming'],
    ['littlestache/rust-server:latest', 'gaming'],
    ['pfeiffermax/rust-game-server:latest', 'gaming'],
    ['spritsail/fivem:latest', 'gaming'],
    ['jktuned/enshrouded-server:latest', 'gaming'],
    ['sknnr/enshrouded-dedicated-server:latest', 'gaming'],
    ['thmhoag/arkserver:latest', 'gaming'],
    ['factoriotools/factorio:latest', 'gaming'],
    ['littlestache/terraria:latest', 'gaming'],
  ];

  it.each(cases)('categorizes %s as %s', (image, expected) => {
    expect(categorizeApp(image)).toBe(expected);
  });

  it('does not match Rust-language apps on the game keyword', () => {
    expect(categorizeApp('rustdesk/rustdesk-server:latest')).toBe('devops');
    expect(categorizeApp('ekzhang/rustpad:latest')).toBe('web');
  });
});
