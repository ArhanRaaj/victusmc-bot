import { supabase } from './supabase.js';

interface TimezoneData {
    userId: string;
    timezone: string;
}

class TimezoneService {
    async get(guildId: string): Promise<TimezoneData[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_timezones');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch { return []; }
    }

    async save(guildId: string, data: TimezoneData[]): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_timezones', { description: JSON.stringify(data) });
    }

    async set(guildId: string, userId: string, timezone: string): Promise<void> {
        const list = await this.get(guildId);
        const idx = list.findIndex(t => t.userId === userId);
        if (idx !== -1) {
            list[idx].timezone = timezone;
        } else {
            list.push({ userId, timezone });
        }
        await this.save(guildId, list);
    }

    async remove(guildId: string, userId: string): Promise<void> {
        const list = await this.get(guildId);
        const filtered = list.filter(t => t.userId !== userId);
        await this.save(guildId, filtered);
    }

    async getForUser(guildId: string, userId: string): Promise<string | null> {
        const list = await this.get(guildId);
        return list.find(t => t.userId === userId)?.timezone || null;
    }
}

export const timezoneService = new TimezoneService();