// ── Shared domain types ───────────────────────────────────────────────────────

export type DropLocation = 'Dungeon' | 'Raid';
export type ReportSource = 'raidbots' | 'qe';
export type GameType = 'Retail' | 'Classic';

// ── Difficulty ────────────────────────────────────────────────────────────────

export const RaidDifficulty = {
  LFR: 0,
  LFRMax: 1,
  Normal: 2,
  NormalMax: 3,
  Heroic: 4,
  HeroicMax: 5,
  Mythic: 6,
  MythicMax: 7,
} as const;

export type RaidDifficultyValue = (typeof RaidDifficulty)[keyof typeof RaidDifficulty];

// ── Constants interfaces ───────────────────────────────────────────────────────

export type TierName =
  | 'Explorer'
  | 'Adventurer'
  | 'Veteran'
  | 'Champion'
  | 'Hero'
  | 'Myth'
  | 'Runed Crafted'
  | 'Gilded Crafted';

export type ItemQuality = 3 | 4 | 5 | 6;

// ── Instance DB interfaces ────────────────────────────────────────────────────

export interface RaidInstanceEntry {
  name: string;
  bossOrder: number[];
  bosses: Record<number, string>;
}

export interface DungeonGroupEntry {
  bossOrder: number[];
  bossOrderMythicPlus: number[];
  [dungeonId: number]: string;
}

export interface DungeonInstanceEntry {
  Retail: DungeonGroupEntry;
  Classic: DungeonGroupEntry;
}

// ── Raidbots API response shape ───────────────────────────────────────────────

interface RaidbotsCollectedData {
  dps: { mean: number };
}

interface RaidbotsPlayer {
  specialization: string;
  name: string;
  collected_data: RaidbotsCollectedData;
}

interface ProfilesetResult {
  name: string;
  mean: number;
}

interface SimbotEncounter {
  id: number;
  name: string;
}

interface SimbotInstance {
  id: number;
  encounters: SimbotEncounter[];
}

interface SimbotEncounterItem {
  id: number;
  sources: { instanceId: number; encounterId: number }[];
}

export interface RaidbotsReport {
  build_date: string;
  timestamp?: number;
  sim: {
    players: RaidbotsPlayer[];
    profilesets: {
      results: ProfilesetResult[];
    };
  };
  simbot?: {
    meta?: {
      instanceLibrary?: SimbotInstance[];
      encounterItems?: SimbotEncounterItem[];
    };
  };
}

// ── QE API response shape ─────────────────────────────────────────────────────

export interface QEItem {
  item: number;
  level: number;
  dropLoc: string;
  dropDifficulty: number | null;
  percDiff: number;
  sourceName?: string;
}

export interface QEReport {
  id: string;
  dateCreated: string;
  playername: string;
  realm: string;
  spec: string;
  contentType: string;
  ufSettings: Record<string, number | number[]>;
  gameType?: string;
  results: QEItem[];
}

// ── Compact output shapes ─────────────────────────────────────────────────────

export interface CompactItem {
  item: number;
  level: number;
  dropLoc: DropLocation;
  dropDifficulty: number | null;
  percDiff: number;
  sourceName?: string;
  dropBoss?: string;
}

export interface SourceGroup {
  sourceId: number;
  sourceName: string | null;
  timestamp: number; // Unix epoch seconds
  dropLoc: DropLocation;
  items: CompactItem[];
}

export interface RaidbotsCompact {
  type: 'raidbots';
  spec: string;
  playername: string;
  date: string;
  contentType: DropLocation;
  ufSettings: Record<string, number | number[]>;
  sources: SourceGroup[];
}

export interface QECompact {
  type: 'qe';
  id: string;
  dateCreated: string;
  playername: string;
  realm: string;
  spec: string;
  contentType: string;
  ufSettings: Record<string, number | number[]>;
  gameType: string;
  sources: SourceGroup[];
}
