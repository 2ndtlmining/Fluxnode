import * as localforage from 'localforage';

export let appStore;
window.appStore = appStore = localforage.createInstance({
  name: '_Primary',
  storeName: '_PrimaryStore',
  version: 3
});

export function initStore() {
  appStore.removeItem(StoreKeys.FRACTUS_COUNT)
}

let StoreKeys = {};

StoreKeys.ADDR_SEARCH_HISTORY = 'history_addrs';
StoreKeys.PRIVACY_MODE = 'privacy_mode';
StoreKeys.NOTABLE_NODES = 'notable_nodes';
StoreKeys.FRACTUS_COUNT = 'fractus_count';
StoreKeys.GLOBAL_STORE = 'global_store';

window.SK = window.StoreKeys = StoreKeys;
Object.freeze(StoreKeys);
export { StoreKeys };
