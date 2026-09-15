import assert from 'node:assert/strict';
import test from 'node:test';
import { pageNumbers, soundtrackLayout } from '../app/renderer/soundtrackLayout.ts';

test('grid capacity adapts to both dimensions without overflowing its tile minimums', () => {
  for (const [width, height, gap] of [[1200, 400, 14], [740, 80, 10], [1800, 650, 14], [320, 260, 10]]) {
    const { columns, rows, size } = soundtrackLayout(width, height, gap);
    assert(columns * 200 + (columns - 1) * gap <= width);
    assert(rows * 80 + (rows - 1) * gap <= height);
    assert.equal(size, columns * rows);
    const slots = Array.from({ length: 96 }, (_, index) => index);
    const pages = Array.from({ length: Math.ceil(96 / size) }, (_, page) => slots.slice(page * size, (page + 1) * size));
    assert.deepEqual(pages.flat(), slots);
  }
  assert(soundtrackLayout(1200, 200, 14).size < soundtrackLayout(1200, 400, 14).size);
});

test('pagination stays bounded and includes the current page and both ends', () => {
  for (let page = 0; page < 96; page++) {
    const numbers = pageNumbers(page, 96);
    assert(numbers.includes(0) && numbers.includes(95) && numbers.includes(page));
    assert(numbers.length <= 7);
  }
  assert.deepEqual(pageNumbers(0, 1), [0]);
});
