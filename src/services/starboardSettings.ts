import { supabase } from './supabase.js';

export interface StarboardConfig {
    channelId: string;
    minReactions: number;
    emoji: string;
    enabled: boolean;
}

export interface StarredMessage {
    messageId: string;
    channelId: string;
    starboardMessageId: string;
    count: number;
}

class StarboardService {
    async getConfig(guildId: string): Promise<StarboardConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_starboard');
            return embed?.description ? JSON.parse(embed.description) : { channelId: '', minReactions: 3, emoji: '⭐', enabled: false };
        } catch { return { channelId: '', minReactions: 3, emoji: '⭐', enabled: false }; }
    }

    async saveConfig(guildId: string, config: StarboardConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_starboard', { description: JSON.stringify(config) });
    }

    async getStarred(guildId: string): Promise<StarredMessage[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_starred');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch { return []; }
    }

    async addStarred(guildId: string, entry: StarredMessage): Promise<void> {
        const list = await this.getStarred(guildId);
        list.push(entry);
        await supabase.saveCustomEmbed(guildId, '_starred', { description: JSON.stringify(list) });
    }

    async updateStarred(guildId: string, messageId: string, count: number): Promise<void> {
        const list = await this.getStarred(guildId);
        const idx = list.findIndex(s => s.messageId === messageId);
        if (idx !== -1) {
            list[idx].count = count;
            await supabase.saveCustomEmbed(guildId, '_starred', { description: JSON.stringify(list) });
        }
    }

    async removeStarred(guildId: string, messageId: string): Promise<void> {
        const list = await this.getStarred(guildId);
        const filtered = list.filter(s => s.messageId !== messageId);
        await supabase.saveCustomEmbed(guildId, '_starred', { description: JSON.stringify(filtered) });
    }
}

export const starboardService = new StarboardService();