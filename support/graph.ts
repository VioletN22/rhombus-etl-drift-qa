/** Pipeline graph helpers shared by the UI and API suites. */

export type Edge = [source: string, target: string];

/** Node ids reachable from `start` by following edges forward. */
export function reachable(edges: Edge[], start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const from = queue.shift()!;
    for (const [src, dst] of edges) {
      if (src === from && !seen.has(dst)) {
        seen.add(dst);
        queue.push(dst);
      }
    }
  }
  return seen;
}
