/**
 * Image URL check (network): HEAD every catalog image URL of a set and report the ones
 * that don't answer 200.
 *
 *   npm run check-images -- --set fossil          # one set (id from CARD_SETS)
 *   npm run check-images                          # every set
 *
 * Exit code 1 when any URL failed.
 */

import { CARD_SETS, getCardImageUrl } from "../src/domain/catalog";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function status(url: string): Promise<number | string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow" });
      if (response.status !== 429 && response.status < 500) return response.status;
    } catch (error) {
      if (attempt === 2) return error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  return "no answer";
}

async function main(): Promise<void> {
  const only = argValue("set");
  const sets = only ? CARD_SETS.filter((s) => s.id === only) : CARD_SETS;
  if (sets.length === 0) throw new Error(`Unknown set "${only}" (known: ${CARD_SETS.map((s) => s.id).join(", ")})`);

  let failed = 0;
  for (const set of sets) {
    const results: { card: string; url: string; status: number | string }[] = [];
    const queue = [...set.cards];
    const workers = Array.from({ length: 6 }, async () => {
      for (let card = queue.shift(); card; card = queue.shift()) {
        const url = getCardImageUrl(card);
        results.push({ card: `#${card.number} ${card.name}`, url, status: await status(url) });
      }
    });
    await Promise.all(workers);
    const bad = results.filter((r) => r.status !== 200);
    failed += bad.length;
    console.log(`[${set.id}] ${results.length - bad.length}/${results.length} image URLs answer 200`);
    for (const r of bad.sort((a, b) => a.card.localeCompare(b.card))) console.log(`  ${r.status}  ${r.card}  ${r.url}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
