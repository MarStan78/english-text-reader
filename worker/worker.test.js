import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from './worker.js';

test('buildPrompt uses the British instruction by default accent value', () => {
  const result = buildPrompt('Hello there.', 'british');
  assert.match(result, /Read the following text aloud in a natural British English accent:/);
});

test('buildPrompt uses the American instruction for american accent', () => {
  const result = buildPrompt('Hello there.', 'american');
  assert.match(result, /Read the following text aloud in a natural American English accent:/);
});

test('buildPrompt treats any non-"american" value as British', () => {
  const result = buildPrompt('Hello there.', 'nonsense');
  assert.match(result, /British English accent/);
});

test('buildPrompt includes the original text unmodified after the instruction', () => {
  const result = buildPrompt('Line one.\nLine two.', 'british');
  assert.match(result, /Line one\.\nLine two\.$/);
});
