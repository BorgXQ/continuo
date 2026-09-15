export function soundtrackLayout(width: number, height: number, gap: number) {
  const columns = Math.max(1, Math.floor((width + gap) / (200 + gap)));
  const rows = Math.max(1, Math.floor((height + gap) / (80 + gap)));
  return { columns, rows, size: columns * rows };
}

export function pageNumbers(page: number, pages: number): (number | 'gap')[] {
  const visible = new Set([0, pages - 1, page - 1, page, page + 1]);
  const result: (number | 'gap')[] = [];
  for (const index of [...visible].filter(index => index >= 0 && index < pages).sort((a, b) => a - b)) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && index > previous + 1) result.push('gap');
    result.push(index);
  }
  return result;
}
