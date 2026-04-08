/**
 * Build a simple region graph + site links for campaignSpec.worldMap (host tool).
 * Output is JSON-friendly plain objects; English fantasy-style region labels.
 */

const REGION_FIRST = [
  'North',
  'South',
  'East',
  'West',
  'High',
  'Low',
  'Black',
  'Red',
  'Grey',
  'Green',
  'Stone',
  'Silver',
  'Gold',
  'Frost',
  'Ember',
  'Storm',
];

const REGION_SECOND = [
  'Marches',
  'Reach',
  'Wold',
  'Moors',
  'Fells',
  'Vale',
  'Heath',
  'Barrens',
  'Hollow',
  'Ridings',
  'March',
  'Expanse',
  'Borders',
  'Depths',
  'Rise',
];

const TERRAINS = ['hills', 'forest', 'coast', 'plains', 'moor', 'river vale', 'highland', 'fen'];

function pick(arr, i) {
  return arr[Math.abs(i) % arr.length];
}

function randomTerrain(seed) {
  return pick(TERRAINS, seed * 17 + 3);
}

function labelForIndex(i) {
  return `${pick(REGION_FIRST, i * 7)} ${pick(REGION_SECOND, i * 11)}`.trim();
}

function addEdge(a, b) {
  if (!a.neighborIds.includes(b.id)) a.neighborIds.push(b.id);
  if (!b.neighborIds.includes(a.id)) b.neighborIds.push(a.id);
}

/**
 * @param {Array<{ name?: string }>} keyLocations from campaignSpec.keyLocations
 * @returns {{ regions: object[], siteLinks: object[], startingRegionId: string, source: string }}
 */
export function buildProceduralWorldMap(keyLocations) {
  const names = (Array.isArray(keyLocations) ? keyLocations : [])
    .map((x) => (x && typeof x === 'object' && x.name != null ? String(x.name).trim() : ''))
    .filter(Boolean);

  const n = Math.min(12, Math.max(4, names.length || 6));
  const regions = [];
  for (let i = 0; i < n; i++) {
    regions.push({
      id: `r${i}`,
      name: labelForIndex(i),
      terrain: randomTerrain(i),
      neighborIds: [],
    });
  }
  for (let i = 0; i < n; i++) {
    addEdge(regions[i], regions[(i + 1) % n]);
  }
  const extra = n + 2;
  for (let e = 0; e < extra; e++) {
    const i = Math.floor(Math.random() * n);
    let j = Math.floor(Math.random() * n);
    if (j === i) j = (j + 1) % n;
    const a = regions[i];
    const b = regions[j];
    if (a.neighborIds.length < 6 && b.neighborIds.length < 6) {
      addEdge(a, b);
    }
  }

  const siteLinks = [];
  names.forEach((locName, idx) => {
    siteLinks.push({
      locationName: locName,
      regionId: regions[idx % n].id,
    });
  });

  return {
    regions,
    siteLinks,
    startingRegionId: regions[0].id,
    source: 'procedural',
  };
}
