import { hostsFluxnodeApp, FLUXNODE_APP_REPO } from './fluxnodeApp';

/*
 * Issue #245 -- does the wallet being viewed host FluxNode itself?
 *
 * Matched on REPOTAG, not app name. The name is whatever the operator called
 * their deployment; the repotag is the image's stable identity. Someone running
 * 2ndtlmining/flux under their own deployment name is still running FluxNode
 * and should earn this.
 *
 * Live figures at the time of writing: 4 nodes across 4 wallets, out of 837
 * wallets on the network.
 */
const node = (installedApps) => ({ installedApps });

describe('hostsFluxnodeApp', () => {
  it('finds the official deployment', () => {
    expect(hostsFluxnodeApp([node([{ name: 'Fluxnode', repotag: '2ndtlmining/flux:latest' }])])).toBe(true);
  });

  it('finds it under a different deployment name', () => {
    // Matching on the name alone would miss this.
    expect(hostsFluxnodeApp([node([{ name: 'my-dashboard', repotag: '2ndtlmining/flux:latest' }])])).toBe(true);
  });

  it('finds it as one component of a compose app', () => {
    expect(
      hostsFluxnodeApp([
        node([{ name: 'stack', compose: [{ repotag: 'postgres:16' }, { repotag: '2ndtlmining/flux:latest' }] }]),
      ])
    ).toBe(true);
  });

  it('ignores the image tag, so a pinned version still counts', () => {
    expect(hostsFluxnodeApp([node([{ name: 'x', repotag: '2ndtlmining/flux:v1.2.3' }])])).toBe(true);
  });

  it('is case-insensitive about the repotag', () => {
    expect(hostsFluxnodeApp([node([{ name: 'x', repotag: '2ndTLMining/Flux:latest' }])])).toBe(true);
  });

  it('finds it on ANY node of the fleet, not just the first', () => {
    expect(
      hostsFluxnodeApp([
        node([{ name: 'a', repotag: 'nginx:latest' }]),
        node([{ name: 'b', repotag: 'postgres:16' }]),
        node([{ name: 'c', repotag: '2ndtlmining/flux:latest' }]),
      ])
    ).toBe(true);
  });

  it('is false for a fleet running other apps', () => {
    expect(hostsFluxnodeApp([node([{ name: 'a', repotag: 'presearch/node:latest' }])])).toBe(false);
  });

  it('does not match a different image that merely mentions flux', () => {
    // runonflux/* is most of the network; matching loosely would award this to
    // almost everybody and make a platinum achievement meaningless.
    expect(hostsFluxnodeApp([node([{ name: 'a', repotag: 'runonflux/orbit:latest' }])])).toBe(false);
    expect(hostsFluxnodeApp([node([{ name: 'a', repotag: 'someoneelse/fluxnode:latest' }])])).toBe(false);
  });

  it('does not match on the app NAME alone', () => {
    // An unrelated app called "fluxnode" is not this app.
    expect(hostsFluxnodeApp([node([{ name: 'Fluxnode', repotag: 'evil/imposter:latest' }])])).toBe(false);
  });

  it('is false for an empty or missing fleet', () => {
    expect(hostsFluxnodeApp([])).toBe(false);
    expect(hostsFluxnodeApp(null)).toBe(false);
    expect(hostsFluxnodeApp(undefined)).toBe(false);
  });

  it('tolerates nodes with no apps and malformed entries', () => {
    expect(hostsFluxnodeApp([node(null), node([]), node([{}]), {}])).toBe(false);
  });

  it('exports the repo it matches on, so the value is not duplicated at call sites', () => {
    expect(FLUXNODE_APP_REPO).toBe('2ndtlmining/flux');
  });
});
