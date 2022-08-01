import * as localforage from 'localforage';

export let appStore;
window.appStore = appStore = localforage.createInstance({
  name: '_Primary',
  storeName: '_PrimaryStore',
  version: 3
});

export function initStore() {
  // noop
}

let StoreKeys = {};

StoreKeys.ADDR_SEARCH_HISTORY = 'history_addrs';

window.SK = window.StoreKeys = StoreKeys;
Object.freeze(StoreKeys);
export { StoreKeys };
