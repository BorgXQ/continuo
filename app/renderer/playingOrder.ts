export function movePlaying(ids: string[], source: string, target: string, before: boolean): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  const result = ids.filter(id => id !== source);
  result.splice(result.indexOf(target) + (before ? 0 : 1), 0, source);
  return result;
}
