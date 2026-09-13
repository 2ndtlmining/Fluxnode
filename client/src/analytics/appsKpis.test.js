import { nodesRunningApps } from './appsKpis';

describe('nodesRunningApps', () => {
  it('counts the nodes that have running containers', () => {
    const gstore = { nodesByIp: { '1.2.3.4:16127': {}, '5.6.7.8:16127': {} } };

    expect(nodesRunningApps(gstore)).toBe(2);
  });

  it('is zero rather than a crash when the aggregate is missing', () => {
    // The running-app fetch fails soft (#144): the store can arrive without
    // nodesByIp, and a KPI tile must not take the page down with it.
    for (const gstore of [null, undefined, {}, { nodesByIp: null }, { nodesByIp: 'nope' }]) {
      expect(nodesRunningApps(gstore)).toBe(0);
    }
  });

  it('does not need to filter empty nodes, because fluxinfo omits them', () => {
    // Documented in fluxinfo.js: perNode is only pushed when the node has at
    // least one running container. If that ever changes this test is the thing
    // that should start failing.
    expect(nodesRunningApps({ nodesByIp: {} })).toBe(0);
  });
});
