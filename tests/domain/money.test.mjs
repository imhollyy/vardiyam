import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMoneyInput, parseTryMinor, formatTryMinor } from '../../src/domain/money.ts';

// ─── formatMoneyInput ─────────────────────────────────────────────────────────

test('formatMoneyInput: boş girdi boş döner', () => {
  assert.equal(formatMoneyInput(''), '');
});

test('formatMoneyInput: rakamlar bin ayırıcı alır', () => {
  assert.equal(formatMoneyInput('35000'), '35.000');
});

test('formatMoneyInput: virgülle birlikte kuruş korunur', () => {
  assert.equal(formatMoneyInput('35000,50'), '35.000,50');
});

test('formatMoneyInput: virgül yazılmaya başlandığında korunur', () => {
  assert.equal(formatMoneyInput('1500,'), '1.500,');
});

test('formatMoneyInput: tek kuruş basamağı korunur', () => {
  assert.equal(formatMoneyInput('1500,5'), '1.500,5');
});

test('formatMoneyInput: 3 kuruş basamağını keser', () => {
  assert.equal(formatMoneyInput('1500,509'), '1.500,50');
});

test('formatMoneyInput: küçük tutar bin ayırıcı almaz', () => {
  assert.equal(formatMoneyInput('500'), '500');
});

test('formatMoneyInput: sıfır girdi', () => {
  assert.equal(formatMoneyInput('0'), '0');
});

test('formatMoneyInput: harf ve semboller temizlenir', () => {
  assert.equal(formatMoneyInput('abc35000xyz'), '35.000');
});

test('formatMoneyInput: nokta temizlenir, kalan rakamlar formatlanır', () => {
  // decimal-pad klavyesinde nokta yok; nokta girilse bile silerek kalan rakamları formatlar
  assert.equal(formatMoneyInput('35.000'), '35.000');
});

test('formatMoneyInput: milyonluk tutar', () => {
  assert.equal(formatMoneyInput('1000000'), '1.000.000');
});

// ─── parseTryMinor (regression) ───────────────────────────────────────────────

test('parseTryMinor: Türkçe biçim 35.000,50', () => {
  assert.equal(parseTryMinor('35.000,50'), 3500050);
});

test('parseTryMinor: noktalı tam lira 35.000', () => {
  assert.equal(parseTryMinor('35.000'), 3500000);
});

test('parseTryMinor: dot-decimal 35000.50', () => {
  assert.equal(parseTryMinor('35000.50'), 3500050);
});

test('parseTryMinor: sıfır reddedilir', () => {
  assert.throws(() => parseTryMinor('0'), /sıfır/i);
});

test('parseTryMinor: allowZero ile sıfır kabul edilir', () => {
  assert.equal(parseTryMinor('0', true), 0);
});

// ─── formatTryMinor (regression) ─────────────────────────────────────────────

const NBSP = ' '; // non-breaking space used by Intl before ₺

test('formatTryMinor: 3500050 → "35.000,50 ₺"', () => {
  assert.equal(formatTryMinor(3500050), `35.000,50${NBSP}₺`);
});

test('formatTryMinor: 100 → "1,00 ₺"', () => {
  assert.equal(formatTryMinor(100), `1,00${NBSP}₺`);
});

test('formatTryMinor: negatif', () => {
  assert.equal(formatTryMinor(-100), `−1,00${NBSP}₺`);
});
