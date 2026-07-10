import { Collection } from 'discord.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface LevelingConfig {
    enabled: boolean;
    chatChannels: string[];
    voiceChannels: string[];
    announceChannel: string | null;
    levelLogChannel: string | null;
    roleRewards: { level: number; roleId: string }[];
}

export interface UserLevel {
    userId: string;
    guildId: string;
    chatXp: number;
    voiceXp: number;
    lastMessageXp: number;
    lastVoiceXp: number;
}

const MAX_LEVEL = 100;
const CHAT_COOLDOWN_MS = 60_000;
const VOICE_COOLDOWN_MS = 60_000;
const CHAT_XP_MIN = 5;
const CHAT_XP_MAX = 10;
const VOICE_XP_PER_TICK = 1;
const VOICE_TICK_INTERVAL_MS = 35_000;

const configsPath = join(process.cwd(), 'data', 'leveling_configs.json');
const levelsPath = join(process.cwd(), 'data', 'user_levels.json');

const configsCache = new Collection<string, LevelingConfig>();
const levelsCache = new Collection<string, Collection<string, UserLevel>>();

const defaultConfig: LevelingConfig = {
    enabled: false,
    chatChannels: [],
    voiceChannels: [],
    announceChannel: null,
    levelLogChannel: null,
    roleRewards: [],
};

async function loadConfigs(): Promise<void> {
    try {
        const raw = await readFile(configsPath, 'utf-8');
        const parsed: Record<string, LevelingConfig> = JSON.parse(raw);
        for (const [guildId, config] of Object.entries(parsed)) {
            configsCache.set(guildId, config);
        }
    } catch { }
}

async function loadLevels(): Promise<void> {
    try {
        const raw = await readFile(levelsPath, 'utf-8');
        const parsed: Record<string, Record<string, UserLevel>> = JSON.parse(raw);
        for (const [guildId, users] of Object.entries(parsed)) {
            const col = new Collection<string, UserLevel>();
            for (const [userId, data] of Object.entries(users)) {
                col.set(userId, data);
            }
            levelsCache.set(guildId, col);
        }
    } catch { }
}

async function saveConfigs(): Promise<void> {
    const obj: Record<string, LevelingConfig> = {};
    for (const [guildId, config] of configsCache) {
        obj[guildId] = config;
    }
    await writeFile(configsPath, JSON.stringify(obj, null, 2), 'utf-8');
}

async function saveLevels(): Promise<void> {
    const obj: Record<string, Record<string, UserLevel>> = {};
    for (const [guildId, users] of levelsCache) {
        obj[guildId] = {};
        for (const [userId, data] of users) {
            obj[guildId][userId] = data;
        }
    }
    await writeFile(levelsPath, JSON.stringify(obj, null, 2), 'utf-8');
}

export async function save(): Promise<void> {
    await Promise.all([saveConfigs(), saveLevels()]);
}

export function getConfig(guildId: string): LevelingConfig {
    return configsCache.get(guildId) || { ...defaultConfig };
}

export function updateConfig(guildId: string, partial: Partial<LevelingConfig>): LevelingConfig {
    const existing = getConfig(guildId);
    const updated = { ...existing, ...partial };
    configsCache.set(guildId, updated);
    saveConfigs();
    return updated;
}

export function getUserLevel(guildId: string, userId: string): UserLevel {
    if (!levelsCache.has(guildId)) {
        levelsCache.set(guildId, new Collection());
    }
    const guildLevels = levelsCache.get(guildId)!;
    if (!guildLevels.has(userId)) {
        guildLevels.set(userId, {
            userId,
            guildId,
            chatXp: 0,
            voiceXp: 0,
            lastMessageXp: 0,
            lastVoiceXp: 0,
        });
    }
    return guildLevels.get(userId)!;
}

export function addChatXp(guildId: string, userId: string): { leveledUp: boolean; newLevel: number } {
    const userLevel = getUserLevel(guildId, userId);
    const now = Date.now();
    if (now - userLevel.lastMessageXp < CHAT_COOLDOWN_MS) {
        return { leveledUp: false, newLevel: calculateLevel(userLevel.chatXp) };
    }
    const xpGain = CHAT_XP_MIN + Math.floor(Math.random() * (CHAT_XP_MAX - CHAT_XP_MIN + 1));
    userLevel.chatXp += xpGain;
    userLevel.lastMessageXp = now;
    const oldLevel = calculateLevel(userLevel.chatXp - xpGain);
    const newLevel = calculateLevel(userLevel.chatXp);
    saveLevels();
    return { leveledUp: newLevel > oldLevel, newLevel };
}

export function addVoiceXp(guildId: string, userId: string): { leveledUp: boolean; newLevel: number } {
    const userLevel = getUserLevel(guildId, userId);
    const now = Date.now();
    if (now - userLevel.lastVoiceXp < VOICE_TICK_INTERVAL_MS) {
        return { leveledUp: false, newLevel: calculateLevel(userLevel.voiceXp) };
    }
    userLevel.voiceXp += VOICE_XP_PER_TICK;
    userLevel.lastVoiceXp = now;
    const oldLevel = calculateLevel(userLevel.voiceXp - VOICE_XP_PER_TICK);
    const newLevel = calculateLevel(userLevel.voiceXp);
    saveLevels();
    return { leveledUp: newLevel > oldLevel, newLevel };
}

export function calculateLevel(xp: number): number {
    if (xp <= 0) return 0;
    return Math.min(Math.floor(Math.sqrt(25 + 0.2 * xp) - 5), MAX_LEVEL);
}

export function xpForNextLevel(level: number): number {
    return 5 * (level + 1) ** 2 + 50 * (level + 1);
}

export function xpForLevel(level: number): number {
    if (level <= 0) return 0;
    return 5 * level ** 2 + 50 * level;
}

export function addRoleReward(guildId: string, level: number, roleId: string): void {
    const config = getConfig(guildId);
    const existing = config.roleRewards.find(r => r.level === level);
    if (existing) {
        existing.roleId = roleId;
    } else {
        config.roleRewards.push({ level, roleId });
    }
    config.roleRewards.sort((a, b) => a.level - b.level);
    updateConfig(guildId, { roleRewards: config.roleRewards });
}

export function removeRoleReward(guildId: string, level: number): boolean {
    const config = getConfig(guildId);
    const before = config.roleRewards.length;
    config.roleRewards = config.roleRewards.filter(r => r.level !== level);
    if (config.roleRewards.length !== before) {
        updateConfig(guildId, { roleRewards: config.roleRewards });
        return true;
    }
    return false;
}

export function checkRoleRewards(guildId: string, userLevel: number): string[] {
    const config = getConfig(guildId);
    return config.roleRewards
        .filter(r => r.level <= userLevel)
        .map(r => r.roleId);
}

// Voice session tracking
const voiceSessions = new Collection<string, number>();

export function startVoiceSession(guildId: string, userId: string): void {
    voiceSessions.set(`${guildId}:${userId}`, Date.now());
}

export function endVoiceSession(guildId: string, userId: string): void {
    voiceSessions.delete(`${guildId}:${userId}`);
}

export function getVoiceSessionStart(guildId: string, userId: string): number | undefined {
    return voiceSessions.get(`${guildId}:${userId}`);
}

// Initialize
loadConfigs();
loadLevels();
