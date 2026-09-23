/**
 * Series downsampling for chart rendering.
 *
 * Recharts renders one SVG node per data point; raw series with thousands of
 * points make charts janky. `downsampleSeries` implements LTTB (Largest
 * Triangle Three Buckets) — the standard visual-fidelity-preserving
 * downsampler — capped at `maxPoints` (default 500).
 *
 * Points are generic objects; `x`/`y` accessors extract numeric coordinates
 * used for triangle area. The returned array contains a subset of the
 * ORIGINAL point objects (first/last always kept), so any extra fields are
 * preserved for tooltips.
 */

export interface PointAccessor<T> {
  x: (p: T, index: number) => number;
  y: (p: T) => number;
}

const DEFAULT_MAX_POINTS = 500;

export function downsampleSeries<T>(
  data: readonly T[],
  maxPoints: number = DEFAULT_MAX_POINTS,
  accessor?: PointAccessor<T>
): T[] {
  if (!Array.isArray(data) || data.length <= maxPoints || maxPoints < 3) {
    return Array.isArray(data) ? data.slice() : [];
  }

  const getX = accessor?.x ?? ((_p: T, i: number) => i);
  const getY = accessor?.y ?? ((p: T) => Number((p as Record<string, unknown>)?.value ?? 0));

  const n = data.length;
  const sampled: T[] = [];
  sampled.push(data[0]); // Always keep the first point

  const bucketSize = (n - 2) / (maxPoints - 2);

  let a = 0; // Index of the previously selected point
  for (let i = 0; i < maxPoints - 2; i++) {
    // Average point of the NEXT bucket (the "third vertex")
    const nextStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    let avgX = 0;
    let avgY = 0;
    const avgCount = nextEnd - nextStart || 1;
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += getX(data[j], j);
      avgY += getY(data[j]);
    }
    avgX /= avgCount;
    avgY /= avgCount;

    // Current bucket range
    const curStart = Math.floor(i * bucketSize) + 1;
    const curEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);

    const ax = getX(data[a], a);
    const ay = getY(data[a]);

    // Pick the point in the current bucket forming the largest triangle
    let maxArea = -1;
    let maxIdx = curStart;
    for (let j = curStart; j < curEnd; j++) {
      const area = Math.abs(
        (ax - avgX) * (getY(data[j]) - ay) - (ax - getX(data[j], j)) * (avgY - ay)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
    a = maxIdx;
  }

  sampled.push(data[n - 1]); // Always keep the last point
  return sampled;
}
