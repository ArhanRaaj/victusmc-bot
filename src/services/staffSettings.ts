import { Collection } from 'discord.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface StaffMember {
    userId: string;
    addedBy: string;
    addedAt: string;
}

interface AttendanceRecord {
    userId: string;
    guildId: string;
    date: string;
    timestamp: string;
}

export interface AttendanceConfig {
    enabled: boolean;
    logChannelId: string | null;
}

const staffPath = join(process.cwd(), 'data', 'staff.json');
const attendancePath = join(process.cwd(), 'data', 'attendance.json');
const attendanceConfigPath = join(process.cwd(), 'data', 'attendance_configs.json');
const staffCache = new Collection<string, StaffMember[]>();
const attendanceCache = new Collection<string, AttendanceRecord[]>();
const attendanceConfigCache = new Collection<string, AttendanceConfig>();

async function loadStaff(): Promise<void> {
    try {
        const raw = await readFile(staffPath, 'utf-8');
        const parsed: Record<string, StaffMember[]> = JSON.parse(raw);
        for (const [guildId, entries] of Object.entries(parsed)) {
            staffCache.set(guildId, entries);
        }
    } catch { /* file doesn't exist yet */ }
}

async function loadAttendance(): Promise<void> {
    try {
        const raw = await readFile(attendancePath, 'utf-8');
        const parsed: AttendanceRecord[] = JSON.parse(raw);
        attendanceCache.set('records', parsed);
    } catch { /* file doesn't exist yet */ }
}

async function saveStaff(): Promise<void> {
    const obj: Record<string, StaffMember[]> = {};
    for (const [guildId, entries] of staffCache) {
        obj[guildId] = entries;
    }
    await writeFile(staffPath, JSON.stringify(obj, null, 2), 'utf-8');
}

async function saveAttendance(): Promise<void> {
    const records = attendanceCache.get('records') || [];
    await writeFile(attendancePath, JSON.stringify(records, null, 2), 'utf-8');
}

async function loadAttendanceConfigs(): Promise<void> {
    try {
        const raw = await readFile(attendanceConfigPath, 'utf-8');
        const parsed: Record<string, AttendanceConfig> = JSON.parse(raw);
        for (const [guildId, config] of Object.entries(parsed)) {
            attendanceConfigCache.set(guildId, config);
        }
    } catch { /* file doesn't exist yet */ }
}

async function saveAttendanceConfigs(): Promise<void> {
    const obj: Record<string, AttendanceConfig> = {};
    for (const [guildId, config] of attendanceConfigCache) {
        obj[guildId] = config;
    }
    await writeFile(attendanceConfigPath, JSON.stringify(obj, null, 2), 'utf-8');
}

export function getAttendanceConfig(guildId: string): AttendanceConfig {
    return attendanceConfigCache.get(guildId) || { enabled: false, logChannelId: null };
}

export function updateAttendanceConfig(guildId: string, partial: Partial<AttendanceConfig>): AttendanceConfig {
    const existing = getAttendanceConfig(guildId);
    const updated = { ...existing, ...partial };
    attendanceConfigCache.set(guildId, updated);
    saveAttendanceConfigs();
    return updated;
}

export function addStaffMember(guildId: string, userId: string, addedBy: string): boolean {
    if (!staffCache.has(guildId)) staffCache.set(guildId, []);
    const entries = staffCache.get(guildId)!;
    if (entries.some(e => e.userId === userId)) return false;
    entries.push({ userId, addedBy, addedAt: new Date().toISOString() });
    saveStaff();
    return true;
}

export function removeStaffMember(guildId: string, userId: string): boolean {
    if (!staffCache.has(guildId)) return false;
    const entries = staffCache.get(guildId)!;
    const idx = entries.findIndex(e => e.userId === userId);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    if (entries.length === 0) staffCache.delete(guildId);
    saveStaff();
    return true;
}

export function listStaffMembers(guildId: string): StaffMember[] {
    return staffCache.get(guildId) || [];
}

export function isStaffMember(guildId: string, userId: string): boolean {
    const entries = staffCache.get(guildId);
    if (!entries) return false;
    return entries.some(e => e.userId === userId);
}

export function markAttendance(guildId: string, userId: string): boolean {
    if (!attendanceCache.has('records')) attendanceCache.set('records', []);
    const records = attendanceCache.get('records')!;
    const today = new Date().toISOString().slice(0, 10);
    if (records.some(r => r.guildId === guildId && r.userId === userId && r.date === today)) return false;
    records.push({ userId, guildId, date: today, timestamp: new Date().toISOString() });
    saveAttendance();
    return true;
}

export function getAttendanceLog(guildId: string, date: string): AttendanceRecord[] {
    const records = attendanceCache.get('records') || [];
    return records.filter(r => r.guildId === guildId && r.date === date);
}

export function getAttendanceLogByUser(guildId: string, userId: string): AttendanceRecord[] {
    const records = attendanceCache.get('records') || [];
    return records.filter(r => r.guildId === guildId && r.userId === userId);
}

loadStaff();
loadAttendance();
loadAttendanceConfigs();
