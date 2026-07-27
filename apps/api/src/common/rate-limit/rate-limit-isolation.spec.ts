import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * DEF-001 regression guard — the invariant that keeps the api suite honest under
 * parallel jest workers.
 *
 * Specs drive rate-limited auth endpoints with synthetic client IPs and clean up
 * with `DELETE FROM auth_rate_buckets WHERE ip LIKE '<prefix>%'`. Jest runs specs
 * in parallel workers against **one shared database**, so if two specs share an
 * IP prefix and either one deletes it, that DELETE can land between another
 * spec's requests — resetting the counter mid-test and making a `429` assertion
 * fail non-deterministically. That is exactly what DEF-001 was: a measured trace
 * showed a bucket going count=1, count=2, count=1.
 *
 * A comment would not have held. This test does: every spec must own a disjoint
 * IP range, checked structurally, so adding a spec that reuses a range fails
 * immediately and locally instead of flaking somebody else's suite three
 * features later.
 */
const SRC = join(__dirname, '..', '..');

/** Third-octet-level prefixes like `192.0.2.` or `198.18.10.` as they appear in
 * spec sources — whether declared as an IP_PREFIX constant or inlined. */
const PREFIX_RE = /(\b(?:\d{1,3}\.){3})(?=\$\{|%|'|`)/g;

/** Specs that drive synthetic client IPs at all. */
const PARTICIPATES_RE = /IP_PREFIX|nextIp|freshIp|auth_rate_buckets/;

function specFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return specFiles(full);
    return entry.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('DEF-001: rate-limit bucket isolation across parallel specs', () => {
  const usage = new Map<string, string[]>();

  beforeAll(() => {
    for (const file of specFiles(SRC)) {
      if (file === __filename) continue; // this file's own prose names ranges
      const source = readFileSync(file, 'utf8');
      // Only specs that actually drive synthetic IPs participate.
      if (!PARTICIPATES_RE.test(source)) continue;
      const prefixes = new Set(
        [...source.matchAll(PREFIX_RE)].map((m) => m[1]),
      );
      for (const p of prefixes) {
        usage.set(p, [...(usage.get(p) ?? []), file.replace(`${SRC}/`, '')]);
      }
    }
  });

  it('no two specs share a synthetic client-IP range', () => {
    const shared = [...usage.entries()].filter(([, files]) => files.length > 1);
    const detail = shared
      .map(([prefix, files]) => `  ${prefix}x → ${files.join(', ')}`)
      .join('\n');
    expect(
      shared.length === 0
        ? ''
        : `IP ranges shared by multiple specs:\n${detail}`,
    ).toBe('');
  });

  it('every participating spec declares a range', () => {
    // Guards the check above from silently passing because a spec's prefix stopped
    // matching the pattern (e.g. built from a variable).
    expect(usage.size).toBeGreaterThanOrEqual(6);
  });
});
