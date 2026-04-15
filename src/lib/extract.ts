import { getSourceId, getSourceName, getSourceNameById, getBossName } from './itemSource';
import type {
  DropLocation,
  ReportSource,
  RaidbotsReport,
  QEReport,
  RaidbotsCompact,
  QECompact,
  SourceGroup,
} from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedItem {
  itemID: number;
  ilvl: number;
  slot: string;
  dropLoc: DropLocation;
  dropDifficulty: number | null;
}

export interface UpgradeResult {
  itemID: number;
  ilvl: number;
  slot: string | null;
  dropLoc: DropLocation;
  dropDifficulty: number | null;
  percDiff: number;
  sourceName: string | null;
  dropBoss: string | null;
}

export interface ExtractOutput {
  compact: RaidbotsCompact | QECompact;
  results: UpgradeResult[];
  baseline: number | null;
  spec: string;
  playerName: string;
}

// ── URL detection ────────────────────────────────────────────────────────────

export function detectSource(url: string): ReportSource | null {
  if (/raidbots\.com/.test(url)) return 'raidbots';
  if (/questionablyepic\.com/.test(url)) return 'qe';
  return null;
}

export function raidbotsReportId(url: string): string | null {
  const m = url.match(/(?:simbot\/report|reports)\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

export function qeReportId(url: string): string | null {
  const m = url.match(/upgradereport\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

// ── Raidbots boss lookup ──────────────────────────────────────────────────────
// Builds itemId → bossName from simbot.meta.encounterItems × instanceLibrary.
function buildRaidbotsBossMap(data: RaidbotsReport): Map<number, string> {
  const map = new Map<number, string>();
  const instanceLibrary = data.simbot?.meta?.instanceLibrary;
  const encounterItems = data.simbot?.meta?.encounterItems;
  if (!instanceLibrary || !encounterItems) return map;

  const encounterNames = new Map<number, string>();
  for (const inst of instanceLibrary) {
    for (const enc of inst.encounters) {
      encounterNames.set(enc.id, enc.name);
    }
  }

  for (const item of encounterItems) {
    const bossSource = item.sources.find((s) => s.instanceId > 0);
    if (bossSource) {
      const name = encounterNames.get(bossSource.encounterId);
      if (name) map.set(item.id, name);
    }
  }

  return map;
}

// ── Parse a profileset name string ──────────────────────────────────────────
// Format: -1/-1/dungeon-mythic-weekly10/193708/272/0/finger1///[extra]
function parseName(name: string): ParsedItem | null {
  const parts = name.split('/');
  if (parts.length < 7) return null;

  const contentStr = parts[2];
  const itemID = parseInt(parts[3], 10);
  const ilvl = parseInt(parts[4], 10);
  const slot = parts[6];

  if (!itemID || !ilvl || !contentStr || !slot) return null;

  const keyMatch = contentStr.match(/(\d+)$/);
  const keyLevel = keyMatch ? parseInt(keyMatch[1], 10) : null;

  let dropLoc: DropLocation;
  let dropDifficulty: number | null;

  if (contentStr.startsWith('dungeon')) {
    dropLoc = 'Dungeon';
    dropDifficulty = keyLevel;
  } else if (contentStr.startsWith('raid')) {
    dropLoc = 'Raid';
    if (contentStr.includes('mythic')) dropDifficulty = 6;
    else if (contentStr.includes('heroic')) dropDifficulty = 4;
    else if (contentStr.includes('normal')) dropDifficulty = 2;
    else dropDifficulty = keyLevel;
  } else {
    return null;
  }

  return { itemID, ilvl, slot, dropLoc, dropDifficulty };
}

// ── Raidbots extraction ──────────────────────────────────────────────────────

export function extract(jsonText: string): ExtractOutput {
  let data: RaidbotsReport;
  try {
    data = JSON.parse(jsonText) as RaidbotsReport;
  } catch {
    throw new Error('Invalid JSON — make sure you copied the full file contents.');
  }

  if (!data.sim)
    throw new Error('This doesn\'t look like a Raidbots report (missing "sim" field).');
  if (!data.sim.profilesets?.results?.length)
    throw new Error(
      'No Droptimizer profilesets found. Make sure this is a Droptimizer report, not a Quick Sim.',
    );

  const player = data.sim.players?.[0];
  const collectedData = player?.collected_data;
  const baseline = collectedData?.raid_dps?.mean ?? collectedData?.dps?.mean;
  if (!baseline) throw new Error('Could not find baseline DPS. The report may be incomplete.');

  const spec = player.specialization || 'Unknown';
  const playerName = player.name || 'Unknown';
  const date = data.build_date || '';

  const armoryLine = data.simbot?.input
    ?.split('\n')
    .find((l) => l.startsWith('armory='));
  const realm = armoryLine
    ? (armoryLine.split(',')[1] ?? '').replace(/^./, (c) => c.toUpperCase())
    : '';

  const bossMap = buildRaidbotsBossMap(data);

  let maxKeyLevel = 0;
  const raidDiffs = new Set<number>();

  const bestPerItem: Record<number, UpgradeResult> = {};

  for (const result of data.sim.profilesets.results) {
    const parsed = parseName(result.name);
    if (!parsed) continue;

    const percDiff = ((result.mean - baseline) / baseline) * 100;
    if (percDiff <= 0) continue;

    const { itemID, ilvl, slot, dropLoc, dropDifficulty } = parsed;

    if (!bestPerItem[itemID] || percDiff > bestPerItem[itemID].percDiff) {
      bestPerItem[itemID] = {
        itemID,
        ilvl,
        slot,
        dropLoc,
        dropDifficulty,
        percDiff,
        sourceName: getSourceName(itemID),
        dropBoss: bossMap.get(itemID) ?? null,
      };
    }

    if (dropLoc === 'Dungeon' && dropDifficulty && dropDifficulty > maxKeyLevel)
      maxKeyLevel = dropDifficulty;
    if (dropLoc === 'Raid' && dropDifficulty) raidDiffs.add(dropDifficulty);
  }

  const results = Object.values(bestPerItem).sort((a, b) => b.percDiff - a.percDiff);

  if (results.length === 0)
    throw new Error(
      'No upgrades found in this report. All items performed below your current gear.',
    );

  const dungeonCount = results.filter((r) => r.dropLoc === 'Dungeon').length;
  const raidCount = results.filter((r) => r.dropLoc === 'Raid').length;
  const contentType: DropLocation = dungeonCount >= raidCount ? 'Dungeon' : 'Raid';

  const ufSettings: Record<string, number | number[]> = {};
  if (maxKeyLevel > 0) ufSettings.dungeon = maxKeyLevel;
  if (raidDiffs.size > 0) ufSettings.raid = [...raidDiffs];

  // Group items by source (dungeon/raid instance). Items whose source cannot be
  // determined are grouped under sourceId 0.
  const timestamp = Math.floor(Date.now() / 1000);
  const groupMap = new Map<number, UpgradeResult[]>();
  for (const r of results) {
    const sid = getSourceId(r.itemID) ?? 0;
    if (!groupMap.has(sid)) groupMap.set(sid, []);
    groupMap.get(sid)!.push(r);
  }

  const sources: SourceGroup[] = [...groupMap.entries()].map(([sourceId, items]) => ({
    sourceId,
    sourceName: getSourceNameById(sourceId),
    timestamp,
    dropLoc: items[0].dropLoc,
    items: items.map((r) => ({
      item: r.itemID,
      level: r.ilvl,
      dropLoc: r.dropLoc,
      dropDifficulty: r.dropDifficulty,
      percDiff: Math.round(r.percDiff * 1000) / 1000,
      ...(r.sourceName ? { sourceName: r.sourceName } : {}),
      ...(r.dropBoss ? { dropBoss: r.dropBoss } : {}),
    })),
  }));

  const compact: RaidbotsCompact = {
    type: 'raidbots',
    spec,
    playername: playerName,
    realm,
    date,
    contentType,
    ufSettings,
    sources,
  };

  return { compact, results, baseline, spec, playerName };
}

// ── QE extraction ────────────────────────────────────────────────────────────
// QE API response is double-encoded: the whole JSON object is a string value.

export function extractQE(rawText: string): ExtractOutput {
  let data = JSON.parse(rawText) as QEReport | string;
  if (typeof data === 'string') data = JSON.parse(data) as QEReport; // unwrap double-encoding

  if (!data.results || !Array.isArray(data.results))
    throw new Error('This doesn\'t look like a QE Upgrade Report (missing "results" field).');
  if (!data.spec) throw new Error('Missing "spec" field in QE report.');

  const rawResults = data.results
    .filter((r) => r.percDiff && r.percDiff > 0 && r.item)
    .sort((a, b) => b.percDiff - a.percDiff);

  if (rawResults.length === 0) throw new Error('No upgrades found in this QE report.');

  const results: UpgradeResult[] = rawResults.map((r) => ({
    itemID: r.item,
    ilvl: r.level,
    slot: null,
    dropLoc: r.dropLoc as DropLocation,
    dropDifficulty: r.dropDifficulty,
    sourceName: getSourceName(r.item),
    dropBoss: getBossName(r.item),
    percDiff: r.percDiff,
  }));

  const timestamp = Math.floor(Date.now() / 1000);
  const groupMap = new Map<number, UpgradeResult[]>();
  for (const r of results) {
    const sid = getSourceId(r.itemID) ?? 0;
    if (!groupMap.has(sid)) groupMap.set(sid, []);
    groupMap.get(sid)!.push(r);
  }

  const sources: SourceGroup[] = [...groupMap.entries()].map(([sourceId, items]) => ({
    sourceId,
    sourceName: getSourceNameById(sourceId),
    timestamp,
    dropLoc: items[0].dropLoc,
    items: items.map((r) => ({
      item: r.itemID,
      level: r.ilvl,
      dropLoc: r.dropLoc,
      dropDifficulty: r.dropDifficulty,
      percDiff: Math.round(r.percDiff * 1000) / 1000,
      ...(r.sourceName ? { sourceName: r.sourceName } : {}),
      ...(r.dropBoss ? { dropBoss: r.dropBoss } : {}),
    })),
  }));

  const compact: QECompact = {
    type: 'qe',
    id: data.id,
    dateCreated: data.dateCreated,
    playername: data.playername,
    realm: data.realm,
    spec: data.spec,
    contentType: data.contentType,
    ufSettings: data.ufSettings,
    gameType: data.gameType ?? 'Retail',
    sources,
  };

  return {
    compact,
    results,
    baseline: null,
    spec: data.spec,
    playerName: data.playername || 'Unknown',
  };
}
