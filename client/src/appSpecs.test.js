import { specResources, buildSpecIndex, repotagForComponent } from './appSpecs';

/*
 * repotagForComponent is the join that stops a running container being
 * attributed to the wrong image. fluxinfo reports which COMPONENT a container
 * is; the spec index holds each component's own repotag. Resolving by app name
 * alone (which is all the code used to do) collapsed every component of a
 * compose app onto compose[0]'s image.
 */

const WORDPRESS_SPEC = {
  name: 'wordpress1',
  instances: 3,
  compose: [
    { name: 'wp', repotag: 'runonflux/wp-nginx:latest', cpu: 1, ram: 1024, hdd: 5 },
    { name: 'mysql', repotag: 'mysql:8.3.0', cpu: 1, ram: 2048, hdd: 10 },
    { name: 'operator', repotag: 'runonflux/shared-db:latest', cpu: 0.5, ram: 512, hdd: 1 },
  ],
};

const SINGLE_SPEC = { name: 'Presearch', repotag: 'presearch/node:latest', cpu: 1, ram: 1024, hdd: 5 };

const ENTERPRISE_SPEC = { name: 'secret1', enterprise: 'encrypted-blob', compose: [] };

describe('buildSpecIndex', () => {
  it('keeps each component name/repotag pair, and nothing else off compose', () => {
    const index = buildSpecIndex([WORDPRESS_SPEC]);
    expect(index.wordpress1.compose).toEqual([
      { name: 'wp', repotag: 'runonflux/wp-nginx:latest' },
      { name: 'mysql', repotag: 'mysql:8.3.0' },
      { name: 'operator', repotag: 'runonflux/shared-db:latest' },
    ]);
  });

  it('leaves compose null when there are no distinct components to resolve', () => {
    const index = buildSpecIndex([SINGLE_SPEC, ENTERPRISE_SPEC]);
    expect(index.Presearch.compose).toBeNull();
    expect(index.secret1.compose).toBeNull();
  });

  it('still carries the aggregate resources and category every other consumer reads', () => {
    const index = buildSpecIndex([WORDPRESS_SPEC]);
    const { cpuPerInst, ramGBPerInst, ssdGBPerInst, repotag } = specResources(WORDPRESS_SPEC);
    expect(index.wordpress1).toMatchObject({ cpuPerInst, ramGBPerInst, ssdGBPerInst, repotag, instances: 3 });
    expect(typeof index.wordpress1.category).toBe('string');
  });
});

describe('repotagForComponent', () => {
  const index = buildSpecIndex([WORDPRESS_SPEC, SINGLE_SPEC, ENTERPRISE_SPEC]);

  it('resolves each component to its OWN image, not to compose[0]', () => {
    expect(repotagForComponent(index.wordpress1, 'wp')).toBe('runonflux/wp-nginx:latest');
    expect(repotagForComponent(index.wordpress1, 'mysql')).toBe('mysql:8.3.0');
    expect(repotagForComponent(index.wordpress1, 'operator')).toBe('runonflux/shared-db:latest');
  });

  it('falls back to the aggregate repotag when the component does not match', () => {
    // e.g. the spec was updated between the two independent fetches
    expect(repotagForComponent(index.wordpress1, 'renamedSinceLastFetch')).toBe('runonflux/wp-nginx:latest');
  });

  it('falls back to the aggregate repotag for a single-component app', () => {
    expect(repotagForComponent(index.Presearch, null)).toBe('presearch/node:latest');
    expect(repotagForComponent(index.Presearch, 'anything')).toBe('presearch/node:latest');
  });

  it('returns an empty string for an enterprise spec, which has no readable image', () => {
    expect(repotagForComponent(index.secret1, null)).toBe('');
    expect(repotagForComponent(index.secret1, 'wp')).toBe('');
  });

  it('returns an empty string for a missing spec, without throwing', () => {
    expect(repotagForComponent(undefined, 'wp')).toBe('');
    expect(repotagForComponent(null, null)).toBe('');
  });

  /*
   * Issue #351: the hosted-application list needs an app's paid term, and
   * `expire` is a DURATION IN BLOCKS measured from `height` -- so it needs
   * both, and the index carried neither. Additive: every existing consumer
   * reads named fields, so nothing sees these unless it asks.
   */
  it('carries the height and expire a term calculation needs', () => {
    const index = buildSpecIndex([
      { name: 'app1', height: 2_900_000, expire: 19506, compose: [{ name: 'c', repotag: 'x:1', cpu: 1, ram: 1024, hdd: 5 }] },
    ]);

    expect(index.app1.height).toBe(2_900_000);
    expect(index.app1.expire).toBe(19506);
  });

  it('defaults a spec with no term to zero rather than undefined', () => {
    // expiryFromHeight treats 0 as "cannot say" and returns null; undefined
    // would work by accident and break the moment anything did arithmetic.
    const index = buildSpecIndex([{ name: 'bare', compose: null }]);

    expect(index.bare.height).toBe(0);
    expect(index.bare.expire).toBe(0);
  });
});
