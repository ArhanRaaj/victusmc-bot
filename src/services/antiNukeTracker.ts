/**
 * In-memory tracker for anti-nuke rate monitoring.
 * Resets automatically after the window expires.
 */

import { logger } from '../utils/logger.js';

interface TrackerEntry {
    count: number;
    timestamps: number[];
    actioners: Map<string, number>;
}

const WINDOW_MS = 5000;
const trackers = new Map<string, TrackerEntry>();

function getKey(guildId: string, type: string): string {
    return `${guildId}:${type}`;
}

function getOrCreate(key: string): TrackerEntry {
    let entry = trackers.get(key);
    if (!entry) {
        entry = { count: 0, timestamps: [], actioners: new Map() };
        trackers.set(key, entry);
    }
    return entry;
}

function prune(entry: TrackerEntry): void {
    const cutoff = Date.now() - WINDOW_MS;
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    entry.count = entry.timestamps.length;
}

export function recordAction(guildId: string, type: string, userId: string): number {
    const key = getKey(guildId, type);
    const entry = getOrCreate(key);
    const now = Date.now();
    entry.timestamps.push(now);
    entry.count++;
    entry.actioners.set(userId, (entry.actioners.get(userId) || 0) + 1);
    prune(entry);
    return entry.count;
}

export function getActioners(guildId: string, type: string): Map<string, number> {
    const key = getKey(guildId, type);
    const entry = trackers.get(key);
    return entry?.actioners || new Map();
}

export function getCount(guildId: string, type: string): number {
    const key = getKey(guildId, type);
    const entry = trackers.get(key);
    if (!entry) return 0;
    prune(entry);
    return entry.count;
}

export function resetTracker(guildId: string, type: string): void {
    const key = getKey(guildId, type);
    trackers.delete(key);
}

setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, entry] of trackers) {
        entry.timestamps = entry.timestamps.filter(t => t > cutoff);
        entry.count = entry.timestamps.length;
        if (entry.count === 0) trackers.delete(key);
    }
}, 10000);
