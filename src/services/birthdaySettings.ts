import { supabase } from './supabase.js';

interface BirthdayEntry {
    userId: string;
    day: number;
    month: number;
}

interface BirthdayConfig {
    channelId: string | null;
    roleId: string | null;
    enabled: boolean;
}

class BirthdayService {
    async getEntries(guildId: string): Promise<BirthdayEntry[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_birthdays');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch { return []; }
    }

    async saveEntries(guildId: string, entries: BirthdayEntry[]): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_birthdays', { description: JSON.stringify(entries) });
    }

    async set(guildId: string, userId: string, day: number, month: number): Promise<void> {
        const entries = await this.getEntries(guildId);
        const idx = entries.findIndex(e => e.userId === userId);
        if (idx !== -1) {
            entries[idx].day = day;
            entries[idx].month = month;
        } else {
            entries.push({ userId, day, month });
        }
        await this.saveEntries(guildId, entries);
    }

    async remove(guildId: string, userId: string): Promise<void> {
        const entries = await this.getEntries(guildId);
        const filtered = entries.filter(e => e.userId !== userId);
        await this.saveEntries(guildId, filtered);
    }

    async getConfig(guildId: string): Promise<BirthdayConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_birthday_config');
            return embed?.description ? JSON.parse(embed.description) : { channelId: null, roleId: null, enabled: false };
        } catch { return { channelId: null, roleId: null, enabled: false }; }
    }

    async saveConfig(guildId: string, config: BirthdayConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_birthday_config', { description: JSON.stringify(config) });
    }

    async getTodaysBirthdays(guildId: string): Promise<BirthdayEntry[]> {
        const entries = await this.getEntries(guildId);
        const now = new Date();
        return entries.filter(e => e.day === now.getDate() && e.month === now.getMonth() + 1);
    }
}

export const birthdayService = new BirthdayService();