import assert from 'node:assert/strict';
import test from 'node:test';

import { shiftKindOf } from '../../src/domain/shift-cycle/shiftKind.ts';

const tpl = (overrides) => ({
  code: 'X',
  startLocalTime: '08:00',
  colorToken: undefined,
  ...overrides,
});

test('shiftKindOf: colorToken takes priority', () => {
  assert.equal(shiftKindOf(tpl({ colorToken: 'night', startLocalTime: '08:00' })), 'night');
  assert.equal(shiftKindOf(tpl({ colorToken: 'day',   startLocalTime: '22:00' })), 'day');
  assert.equal(shiftKindOf(tpl({ colorToken: 'evening' })), 'evening');
  assert.equal(shiftKindOf(tpl({ colorToken: 'leave'   })), 'leave');
});

test('shiftKindOf: code GC → night', () => {
  assert.equal(shiftKindOf(tpl({ code: 'GC', startLocalTime: '08:00' })), 'night');
  assert.equal(shiftKindOf(tpl({ code: 'gc', startLocalTime: '08:00' })), 'night');
});

test('shiftKindOf: code A → evening', () => {
  assert.equal(shiftKindOf(tpl({ code: 'A', startLocalTime: '06:00' })), 'evening');
});

test('shiftKindOf: code G or S → day', () => {
  assert.equal(shiftKindOf(tpl({ code: 'G', startLocalTime: '22:00' })), 'day');
  assert.equal(shiftKindOf(tpl({ code: 'S', startLocalTime: '22:00' })), 'day');
});

test('shiftKindOf: time 05:00–12:59 → day', () => {
  assert.equal(shiftKindOf(tpl({ startLocalTime: '05:00' })), 'day');
  assert.equal(shiftKindOf(tpl({ startLocalTime: '08:00' })), 'day');
  assert.equal(shiftKindOf(tpl({ startLocalTime: '12:59' })), 'day');
});

test('shiftKindOf: time 13:00–19:59 → evening', () => {
  assert.equal(shiftKindOf(tpl({ startLocalTime: '13:00' })), 'evening');
  assert.equal(shiftKindOf(tpl({ startLocalTime: '16:00' })), 'evening');
  assert.equal(shiftKindOf(tpl({ startLocalTime: '19:00' })), 'evening');
});

test('shiftKindOf: time 20:00–04:59 → night', () => {
  assert.equal(shiftKindOf(tpl({ startLocalTime: '20:00' })), 'night');
  assert.equal(shiftKindOf(tpl({ startLocalTime: '22:00' })), 'night');
  assert.equal(shiftKindOf(tpl({ startLocalTime: '00:00' })), 'night');
  assert.equal(shiftKindOf(tpl({ startLocalTime: '04:00' })), 'night');
});
