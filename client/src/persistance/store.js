import * as localforage from 'localforage';
import 'localforage-observable'; //Buchi: Update needed to gain access to newObservables

export let appStore;
window.appStore = appStore = localforage.createInstance({
  name: '_Primary',
  storeName: '_PrimaryStore',
  version: 3
});
console.log(appStore)

export function initStore() {
  appStore.removeItem(StoreKeys.FRACTUS_COUNT);
  appStore.removeItem(StoreKeys.CURRENCY_RATES);
}

let StoreKeys = {};

StoreKeys.ADDR_SEARCH_HISTORY = 'history_addrs';
StoreKeys.PRIVACY_MODE = 'privacy_mode';
StoreKeys.NOTABLE_NODES = 'notable_nodes';
StoreKeys.FRACTUS_COUNT = 'fractus_count';
StoreKeys.CURRENCY_RATES = 'currency_rates';
StoreKeys.GLOBAL_STATS_STORE = 'global_stats_store';

window.SK = window.StoreKeys = StoreKeys;
Object.freeze(StoreKeys);
export { StoreKeys };
