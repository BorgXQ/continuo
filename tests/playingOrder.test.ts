import assert from 'node:assert/strict';
import test from 'node:test';
import { movePlaying } from '../app/renderer/playingOrder.ts';

test('reorders upward and downward, including both ends, without changing membership', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(movePlaying(ids, 'd', 'a', true), ['d', 'a', 'b', 'c']);
  assert.deepEqual(movePlaying(ids, 'a', 'd', false), ['b', 'c', 'd', 'a']);
  assert.deepEqual(movePlaying(ids, 'a', 'c', true), ['b', 'a', 'c', 'd']);
  assert.deepEqual(movePlaying(ids, 'd', 'b', false), ['a', 'b', 'd', 'c']);
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
});

test('ignores self-drops and tracks that stopped during dragging', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(movePlaying(ids, 'a', 'a', false), ids);
  assert.deepEqual(movePlaying(ids, 'stopped', 'a', true), ids);
  assert.deepEqual(movePlaying(ids, 'a', 'stopped', false), ids);
});
