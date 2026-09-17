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

/*
 * Issue #369 -- compose ORDER is an authoring detail, not a statement about
 * what an app is. These are all real specs off the live network where the
 * first-matching-component rule picked the supporting container.
 */
/*
 * Issue #369 -- recognised apps that were sitting in Other purely because no
 * keyword covered them. Every image below was taken from the live network with
 * its container count; the bespoke one-off business sites in the same tail are
 * deliberately NOT here, because a keyword list cannot scale to them.
 */
describe('categorizeApp -- #369 additions from the Other tail', () => {
  const cases = [
    // Distributed computing -- a genuine peer to Folding@Home, not a wrapper.
    ['distributivenetwork/dcp-worker:latest', 'computing'],
    // Browser/indie games from a publisher already well represented in Gaming.
    ['littlestache/devlife:latest', 'gaming'],
    ['littlestache/spacecompany:latest', 'gaming'],
    ['w2vy/gammonbot:latest', 'gaming'],
    // Chat and mail.
    ['ghcr.io/docker-mailserver/docker-mailserver:latest', 'communication'],
    ['hexagon/cryptalk:latest', 'communication'],
    ['vinnydev1/teams_poster-backend:latest', 'communication'],
    // Flux-ecosystem blockchain tooling.
    ['smartico/electrum:latest', 'blockchain'],
    ['wayneshaw349/kasvillage-townhall:v60', 'blockchain'],
    ['2ndtlmining/flux:latest', 'blockchain'],
    ['jefke/fluxpaoverview:latest', 'blockchain'],
    ['w2vy/fluxexport:latest', 'blockchain'],
    ['vinnydev1/dcms-flux-backend:1.1.1', 'blockchain'],
    // Privacy tooling and bandwidth-sharing agents (the pawns-cli/repocket family).
    ['wirewrex/mkp224o:latest', 'vpn'],
    ['proxyrack/pop:latest', 'vpn'],
    ['teddysun/brook:latest', 'vpn'],
    ['theanony/n2n:3.0', 'vpn'],
    // Remote-access desktop apps, alongside the existing webtop/code-server.
    ['linuxserver/libreoffice:latest', 'devops'],
    ['lscr.io/linuxserver/inkscape:latest', 'devops'],
    // Media.
    ['wirewrex/linx-server:latest', 'media'],
    ['movidrom/titlovi:2.0.24', 'media'],
    // Telemetry.
    ['evgs528/node-telemetry-agent:latest', 'monitoring'],
    // Web.
    ['filebrowser/filebrowser:latest', 'web'],
  ];

  it.each(cases)('categorizes %s as %s', (image, expected) => {
    expect(categorizeApp(image)).toBe(expected);
  });
});

describe('categorizeApp -- #369 keywords must not collide', () => {
  it('does not let the short "n2n" and "brook" keywords match unrelated images', () => {
    // Unanchored these would sweep up anything containing the letters.
    expect(categorizeApp('node:22-bookworm-slim')).toBe('other');
    expect(categorizeApp('someorg/conan2net:latest')).toBe('other');
  });

  it('does not let "2ndtlmining" or "dcms-flux" widen into a bare "flux" match', () => {
    expect(categorizeApp('someorg/fluxy-thing:latest')).toBe('other');
  });

  it('keeps the existing Other cases in Other', () => {
    expect(categorizeApp('runonflux/orbit:latest')).toBe('other');
    expect(categorizeApp('busybox:latest')).toBe('other');
    expect(categorizeApp('teammakdi/makdi:bulbasaur')).toBe('other');
  });
});

describe('categorizeAppSpec -- supporting containers must not outrank the payload', () => {
  it('files the Flux Explorer as Blockchain, not Database, though mongo is listed first', () => {
    const spec = {
      name: 'explorer',
      description: 'Official Flux Explorer explorer.runonflux.io',
      compose: [
        { repotag: 'mvertes/alpine-mongo:latest' },
        { repotag: 'runonflux/explorer:latest' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('blockchain');
  });

  it('files an insight explorer as Blockchain though mongo is listed first', () => {
    const spec = {
      name: 'dashexplorer',
      compose: [
        { repotag: 'mvertes/alpine-mongo:latest' },
        { repotag: 'runonflux/dash-insight-explorer:latest' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('blockchain');
  });

  it('files viewtube as Media though two database components are listed first', () => {
    const spec = {
      name: 'viewtube',
      compose: [
        { repotag: 'wirewrex/mongo:7' },
        { repotag: 'redis:7' },
        { repotag: 'mauriceo/viewtube:latest' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('media');
  });

  it('files a multi-protocol proxy stack as VPN, not DevOps on its ssh component', () => {
    // row01/as01/na01/ch01 on the live network: 5 of 6 components are proxies.
    const spec = {
      name: 'row01',
      compose: [
        { repotag: 'sandmanshiri/ssh:latest' },
        { repotag: 'sandmanshiri/shadowsocks:latest' },
        { repotag: 'sandmanshiri/vless:latest' },
        { repotag: 'sandmanshiri/trojan:latest' },
        { repotag: 'sandmanshiri/outline:latest' },
        { repotag: 'sandmanshiri/http-proxy:latest' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('vpn');
  });

  it('does not let an nginx frontend outrank the app behind it', () => {
    const spec = {
      name: 'owncloudssl',
      compose: [
        { repotag: 'wirewrex/nginx-hns:fix' },
        { repotag: 'mysql:8.3.0' },
        { repotag: 'redis:6' },
        { repotag: 'owncloud/server:10.15.0' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('web');
  });

  it('still files a genuine standalone database as Database', () => {
    expect(categorizeAppSpec({ name: 'mydb', compose: [{ repotag: 'mysql:8.3.0' }] })).toBe('database');
    expect(categorizeAppSpec({ name: 'pg', compose: [{ repotag: 'runonflux/flux-pg-cluster:latest' }] })).toBe('database');
  });

  it('keeps a WordPress stack in Web when its database components come later', () => {
    const spec = {
      name: 'wordpress1695330800529',
      compose: [
        { repotag: 'runonflux/wp-nginx:latest' },
        { repotag: 'mysql:8.3.0' },
        { repotag: 'runonflux/shared-db:latest' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('web');
  });

  it('breaks a tie toward the earliest component', () => {
    const spec = {
      name: 'pokerflux',
      compose: [
        { repotag: 'baptistecdr/pokerth-server:main' },
        { repotag: 'wirewrex/nginx-hns:fix' },
        { repotag: 'wirewrex/flux-dns-fdm:CSIAE' },
      ],
    };
    expect(categorizeAppSpec(spec)).toBe('gaming');
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

/*
 * Issue #309. Games ordered from RunOnFlux's dedicated hosting sites ship an
 * encrypted spec (enterprise set, compose empty), so the enterprise branch used
 * to answer before any keyword was consulted -- 103 specs / 219 instances of
 * known games, including four whose keyword was already in the list.
 */
describe('categorizeAppSpec — apps deployed through a dedicated hosting site', () => {
  it('categorizes an encrypted game spec by the site prefix in its name', () => {
    // Real on-network spec: RuneScape: Dragonwilds, the game #309 is about.
    const spec = { name: 'dragonwilds1789155733040', compose: [], enterprise: 'AbCdEf...' };
    expect(categorizeAppSpec(spec)).toBe('gaming');
  });

  it('recovers the games whose keyword was already listed but never reached', () => {
    for (const name of ['valheim1787327994881', 'fivem1787211516616', 'projectzomboid1786661732584']) {
      expect(categorizeAppSpec({ name, compose: [], enterprise: 'x' })).toBe('gaming');
    }
  });

  it('leaves an encrypted spec whose name means nothing in the enterprise bucket', () => {
    // The bucket keeps its meaning: "not allowed to see this", not "unrecognised".
    const spec = { name: 'Fluxtracker', compose: [], enterprise: 'l/CKxfdabV5BoEG8...' };
    expect(categorizeAppSpec(spec)).toBe('enterprise');
  });

  it('still prefers a readable repotag over the site prefix', () => {
    // Not encrypted, so there is a real image to read -- the prefix must not
    // pre-empt the rule that the image wins.
    const spec = {
      name: 'valheim1787327994881',
      compose: [{ repotag: 'yurinnick/folding-at-home:latest' }],
    };
    expect(categorizeAppSpec(spec)).toBe('computing');
  });

  it('does not sweep up a hand-named app that merely starts like a site prefix', () => {
    const spec = { name: 'palworld16slots', compose: [], enterprise: 'x' };
    expect(categorizeAppSpec(spec)).toBe('enterprise');
  });
});
