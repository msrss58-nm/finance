// Navigation invariants, tested against the actual TabRouter implementation
// expo-router 57 ships (expo-router/build/react-navigation/routers), driven
// with the exact back behavior and route names the app's Tabs use.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { TAB_ROUTE_NAMES, TAB_SCREENS, TABS_BACK_BEHAVIOR } from '../src/navigation/routes.ts';
import { seededRandom } from './support/fakes.ts';

type Route = { name: string; key: string };
type TabState = { key: string; index: number; routes: Route[]; history: { key: string }[] };
type Action = { type: string; payload?: { name: string } };
type Options = { routeNames: string[]; routeParamList: Record<string, undefined>; routeGetIdList: Record<string, undefined> };
type Router = {
  getInitialState(o: Options): TabState;
  getStateForAction(s: TabState, a: Action, o: Options): TabState | null;
};

const require = createRequire(import.meta.url);
const { TabRouter } = require('expo-router/build/react-navigation/routers/TabRouter.js') as {
  TabRouter(args: { backBehavior: string }): Router;
};

const routeNames = TAB_SCREENS.map((s) => TAB_ROUTE_NAMES[s]);
const options: Options = { routeNames, routeParamList: {}, routeGetIdList: {} };
const router = TabRouter({ backBehavior: TABS_BACK_BEHAVIOR });

const name = (s: TabState): string => s.routes[s.index]?.name ?? '?';
const history = (s: TabState): string[] => s.history.map((h) => s.routes.find((r) => r.key === h.key)?.name ?? '?');
function go(s: TabState, to: string): TabState {
  const next = router.getStateForAction(s, { type: 'NAVIGATE', payload: { name: to } }, options);
  assert.ok(next, `navigate ${to}`);
  return next;
}
const back = (s: TabState): TabState | null => router.getStateForAction(s, { type: 'GO_BACK' }, options);

test('cold start: Home is the single root history entry', () => {
  const s = router.getInitialState(options);
  assert.equal(name(s), 'index');
  assert.deepEqual(history(s), ['index']);
});

test('Back retraces the visit order deterministically, then is unhandled at the root', () => {
  let s = router.getInitialState(options);
  for (const to of ['forecast', 'goals', 'categories']) s = go(s, to);
  const visited: string[] = [];
  for (let step = back(s); step !== null; step = back(step)) {
    visited.push(name(step));
    s = step;
  }
  assert.deepEqual(visited, ['goals', 'forecast', 'index']);
  // null = not handled by the tab navigator: the root Stack has nothing
  // either, so Android's default root Back (leave the app) proceeds.
  assert.equal(back(s), null);
});

test('tapping the already-active tab adds no history entry', () => {
  let s = go(router.getInitialState(options), 'goals');
  const before = history(s);
  s = go(go(s, 'goals'), 'goals');
  assert.deepEqual(history(s), before);
  assert.deepEqual(before, ['index', 'goals']);
});

test('re-visiting a tab moves it to the end (de-duplicated), like the Flutter oracle', () => {
  let s = router.getInitialState(options);
  for (const to of ['forecast', 'goals', 'forecast']) s = go(s, to);
  assert.deepEqual(history(s), ['index', 'goals', 'forecast']);
});

test('history stays bounded at the 5 screens under random navigation', () => {
  const rand = seededRandom(7);
  let s = router.getInitialState(options);
  for (let i = 0; i < 500; i++) {
    s = go(s, routeNames[Math.floor(rand() * routeNames.length)] ?? 'index');
    assert.ok(s.history.length <= 5);
    assert.equal(new Set(history(s)).size, s.history.length, 'no duplicates');
    assert.equal(history(s).at(-1), name(s), 'current screen is last in history');
  }
});
