import { Observable } from 'rxjs';

/*
 * The rxjs contract that localforage-observable actually depends on (#167).
 *
 * rxjs earns its place in this app through exactly one line, repeated in
 * MainApp.jsx and Home.jsx:
 *
 *   appStore.newObservable.factory = function (subscribeFn) {
 *     return new Observable(subscribeFn);
 *   };
 *
 * localforage-observable declares NO rxjs dependency -- it ships zen-observable
 * and calls whatever factory it is given. So nothing in the library pins a
 * version, and nothing else in this repo imports rxjs. That makes the 5 -> 7
 * upgrade safe, and it also means a break would be completely silent: there are
 * no render tests over the two components that use it, and the subscription
 * only fires on a privacy-mode toggle.
 *
 * These tests pin the four behaviours the factory relies on, so a future rxjs
 * bump fails here rather than in a browser.
 */
describe('rxjs Observable factory contract', () => {
  it('constructs from a subscribe function and delivers values to a partial observer', () => {
    // The object form, not the positional subscribe(next, error, complete):
    // rxjs 7 deprecates positional arguments and rxjs 8 removes them.
    const seen = [];
    const observable = new Observable((subscriber) => {
      subscriber.next({ newValue: true });
      subscriber.next({ newValue: false });
    });

    observable.subscribe({ next: (v) => seen.push(v.newValue) });

    expect(seen).toEqual([true, false]);
  });

  it('returns a subscription that can be unsubscribed', () => {
    // Home.jsx keeps the handle and unsubscribes in componentWillUnmount.
    const observable = new Observable(() => {});
    const subscription = observable.subscribe({ next: () => {} });

    expect(typeof subscription.unsubscribe).toBe('function');
    subscription.unsubscribe();
    expect(subscription.closed).toBe(true);
  });

  it('stops delivering after unsubscribe', () => {
    let emit;
    const seen = [];
    const observable = new Observable((subscriber) => {
      emit = (v) => subscriber.next(v);
    });

    const subscription = observable.subscribe({ next: (v) => seen.push(v) });
    emit('before');
    subscription.unsubscribe();
    emit('after');

    expect(seen).toEqual(['before']);
  });

  it('runs the teardown function the subscribe function returns', () => {
    // localforage-observable returns a teardown to detach its store listener;
    // if this stopped being called the listener would leak on every unmount.
    const teardown = jest.fn();
    const observable = new Observable(() => teardown);

    const subscription = observable.subscribe({ next: () => {} });
    expect(teardown).not.toHaveBeenCalled();

    subscription.unsubscribe();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
