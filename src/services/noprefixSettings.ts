import { Collection } from 'discord.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface NoprefixEntry {
    userId: string;
    addedBy: string;
    addedAt: string;
}

const dataPath = join(process.cwd(), 'data', 'noprefix.json');
const cache = new Collection<string, NoprefixEntry[]>();

async function load(): Promise<void> {
    try {
        const raw = await readFile(dataPath, 'utf-8');
        const parsed: Record<string, NoprefixEntry[]> = JSON.parse(raw);
        for (const [guildId, entries] of Object.entries(parsed)) {
            cache.set(guildId, entries);
        }
    } catch { /* file doesn't exist yet */ }
}

async function save(): Promise<void> {
    const obj: Record<string, NoprefixEntry[]> = {};
    for (const [guildId, entries] of cache) {
        obj[guildId] = entries;
    }
    await writeFile(dataPath, JSON.stringify(obj, null, 2), 'utf-8');
}

export async function addNoprefixUser(guildId: string, userId: string, addedBy: string): Promise<boolean> {
    if (!cache.has(guildId)) cache.set(guildId, []);
    const entries = cache.get(guildId)!;
    if (entries.some(e => e.userId === userId)) return false;
    entries.push({ userId, addedBy, addedAt: new Date().toISOString() });
    await save();
    return true;
}

export async function removeNoprefixUser(guildId: string, userId: string): Promise<boolean> {
    if (!cache.has(guildId)) return false;
    const entries = cache.get(guildId)!;
    const idx = entries.findIndex(e => e.userId === userId);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    if (entries.length === 0) cache.delete(guildId);
    await save();
    return true;
}

export function listNoprefixUsers(guildId: string): NoprefixEntry[] {
    return cache.get(guildId) || [];
}

export function isNoprefixUser(guildId: string, userId: string): boolean {
    const entries = cache.get(guildId);
    if (!entries) return false;
    return entries.some(e => e.userId === userId);
}

load();
