// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planTemplateChanges } from './planTemplateChanges.ts';

/** @param {string} id @param {string} code @param {string} start @param {string} end @param {number} brk */
function tpl(id, code, start, end, brk) {
  return { id, code, name: code, startLocalTime: start, endLocalTime: end, breakMinutes: brk, standardMinutes: 480, colorToken: null, iconKey: null };
}

/** @param {string} code @param {string} start @param {string} end @param {number} brk */
function draft(code, start, end, brk) {
  return { code, name: code, startLocalTime: start, endLocalTime: end, breakMinutes: brk };
}

// ── Test 1: same settings → reuse all ──────────────────────────────────────────

test('same (code, start, end, break) -> reuse all templates', () => {
  const existing = [tpl('t1', 'G', '08:00', '18:00', 60), tpl('t2', 'GC', '22:00', '08:00', 60)];
  const drafts = [draft('G', '08:00', '18:00', 60), draft('GC', '22:00', '08:00', 60)];
  const result = planTemplateChanges(drafts, existing);
  assert.equal(result.reuse.length, 2);
  assert.equal(result.create.length, 0);
  assert.equal(result.reuse[0]?.id, 't1');
  assert.equal(result.reuse[1]?.id, 't2');
});

// ── Test 2: changed time → create new template ────────────────────────────────

test('changed endLocalTime -> creates new template, reuses unchanged one', () => {
  const existing = [tpl('t1', 'G', '08:00', '18:00', 60), tpl('t2', 'GC', '22:00', '08:00', 60)];
  const drafts = [draft('G', '08:00', '17:00', 60), draft('GC', '22:00', '08:00', 60)];
  const result = planTemplateChanges(drafts, existing);
  assert.equal(result.reuse.length, 1);
  assert.equal(result.create.length, 1);
  assert.equal(result.reuse[0]?.id, 't2');
  assert.equal(result.create[0]?.startLocalTime, '08:00');
  assert.equal(result.create[0]?.endLocalTime, '17:00');
});

// ── Test 3: 3 drafts → 2 (removed one) → creates new template ────────────────

test('3 existing, 2 drafts with new time -> one create, one reuse', () => {
  const existing = [
    tpl('t1', 'S', '08:00', '16:00', 30),
    tpl('t2', 'A', '16:00', '00:00', 30),
    tpl('t3', 'GC', '00:00', '08:00', 30),
  ];
  // User changed sabah shift time
  const drafts = [draft('S', '07:00', '15:00', 30), draft('A', '16:00', '00:00', 30)];
  const result = planTemplateChanges(drafts, existing);
  assert.equal(result.reuse.length, 1);
  assert.equal(result.create.length, 1);
  assert.equal(result.reuse[0]?.id, 't2');
  assert.equal(result.create[0]?.startLocalTime, '07:00');
});

// ── Test 4: same times different codes → both new ─────────────────────────────

test('same times but different codes -> create both', () => {
  const existing = [tpl('t1', 'G', '08:00', '18:00', 60)];
  const drafts = [draft('X', '08:00', '18:00', 60), draft('Y', '08:00', '18:00', 60)];
  const result = planTemplateChanges(drafts, existing);
  // 'G' != 'X' and 'G' != 'Y' -> both are new
  assert.equal(result.reuse.length, 0);
  assert.equal(result.create.length, 2);
});
