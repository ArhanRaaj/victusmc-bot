import { supabase } from './supabase.js';

export interface Reminder {
    userId: string;
    channelId: string | null;
    message: string;
    endTime: number;
    reminded: boolean;
}

class ReminderService {
    async get(guildId: string): Promise<Reminder[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_reminders');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch { return []; }
    }

    async save(guildId: string, reminders: Reminder[]): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_reminders', { description: JSON.stringify(reminders) });
    }

    async add(guildId: string, reminder: Reminder): Promise<void> {
        const list = await this.get(guildId);
        list.push(reminder);
        await this.save(guildId, list);
    }

    async remove(guildId: string, index: number): Promise<boolean> {
        const list = await this.get(guildId);
        if (index < 0 || index >= list.length) return false;
        list.splice(index, 1);
        await this.save(guildId, list);
        return true;
    }

    async getDue(guildId: string): Promise<{ index: number; reminder: Reminder }[]> {
        const list = await this.get(guildId);
        const now = Date.now();
        return list
            .map((r, i) => ({ index: i, reminder: r }))
            .filter(({ reminder }) => !reminder.reminded && reminder.endTime <= now);
    }

    async markReminded(guildId: string, index: number): Promise<void> {
        const list = await this.get(guildId);
        if (index >= 0 && index < list.length) {
            list[index].reminded = true;
            await this.save(guildId, list);
        }
    }
}

export const reminderService = new ReminderService();