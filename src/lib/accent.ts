const ACCENT_HUES = [258, 232, 210, 192, 172, 150, 128, 96, 72, 45, 22, 4];

export function accentHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ACCENT_HUES[hash % ACCENT_HUES.length];
}

export function accentStyle(seed: string): React.CSSProperties {
  return { "--acc-h": accentHue(seed) } as React.CSSProperties;
}
