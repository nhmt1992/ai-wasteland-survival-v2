export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRng(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(array: readonly T[], rng: () => number): T {
  const index = Math.floor(rng() * array.length);
  return array[Math.min(array.length - 1, Math.max(0, index))] as T;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}
