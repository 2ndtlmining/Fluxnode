export const column_help = {};

export const reqs = {
  cumulus: {},
  nimbus: {},
  stratus: {},
  fractus: {}
};

export function defhelp(name, desc) {
  column_help[name] = desc;
}

export function defreq(tier, name, value) {
  const container = reqs[tier];
  container[name] = value;
}

/**
 * typeof values_obj = { C: any, N, any, S: any, F: any }
 *
 * Where C is requirement value for CUMULUS tier, N for NIMBUS, S for STRATUS and F for FRACTUS.
 * */
export function defreq_wrap(name, values_obj) {
  defreq('cumulus', name, values_obj['C']);
  defreq('nimbus', name, values_obj['N']);
  defreq('stratus', name, values_obj['S']);
  defreq('fractus', name, values_obj['F']);
}

export function gethelp(name) {
  return column_help[name] || null;
}

export function getreq(tier, name) {
  const container = reqs[tier] || {};

  if (name === true) return container;

  return container[name];
}

export const getreq__cumulus = (name) => getreq('cumulus', name);
export const getreq__nimbus = (name) => getreq('nimbus', name);
export const getreq__stratus = (name) => getreq('stratus', name);
export const getreq__fractus = (name) => getreq('fractus', name);

/* Help Information to show on toolips  */

defhelp(
  'threads',
  <div>
    Number of <strong>logical cores (threads)</strong> attached to the node
  </div>
);

defhelp('ram', <div>Amount of memory available on the node</div>);

defhelp(
  'size',
  <div>
    Amount to <strong>total</strong> storage attached to the node
  </div>
);

defhelp(
  'dws',
  <div>
    <strong>Disk Write Speed</strong>. Speed of disk of the node
  </div>
);

defhelp(
  'eps',
  <div>
    <strong>Events Per Second.</strong> CPU benchmark speed
  </div>
);

defhelp('net_down_speed', <div>Internet download speed</div>);

defhelp('net_up_speed', <div>Internet upload speed</div>);
