import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface ModMailConfig {
    categoryId: string | null;
    staffRoleId: string | null;
    enabled: boolean;
}

export interface ModMailThread {
    userId: string;
    channelId: string;
    guildId: string;
    open: boolean;
}

class ModMailService {
    async getConfig(guildId: string): Promise<ModMailConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_modmail_config');
            return embed?.description ? JSON.parse(embed.description) : { categoryId: null, staffRoleId: null, enabled: false };
        } catch { return { categoryId: null, staffRoleId: null, enabled: false }; }
    }

    async saveConfig(guildId: string, config: ModMailConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_modmail_config', { description: JSON.stringify(config) });
    }

    async getThreads(guildId: string): Promise<ModMailThread[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_modmail_threads');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch { return []; }
    }

    async saveThreads(guildId: string, threads: ModMailThread[]): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_modmail_threads', { description: JSON.stringify(threads) });
    }

    async getOpenThread(guildId: string, userId: string): Promise<ModMailThread | null> {
        const threads = await this.getThreads(guildId);
        return threads.find(t => t.userId === userId && t.open) || null;
    }

    async getThreadByChannel(guildId: string, channelId: string): Promise<ModMailThread | null> {
        const threads = await this.getThreads(guildId);
        return threads.find(t => t.channelId === channelId && t.open) || null;
    }

    async openThread(guildId: string, userId: string, channelId: string): Promise<void> {
        const threads = await this.getThreads(guildId);
        threads.push({ userId, channelId, guildId, open: true });
        await this.saveThreads(guildId, threads);
    }

    async closeThread(guildId: string, userId: string): Promise<void> {
        const threads = await this.getThreads(guildId);
        const idx = threads.findIndex(t => t.userId === userId && t.open);
        if (idx !== -1) {
            threads[idx].open = false;
            await this.saveThreads(guildId, threads);
        }
    }
}

export const modMailService = new ModMailService();