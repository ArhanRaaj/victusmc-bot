import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface StickyConfig {
    messageId: string | null;
    channelId: string;
    content: string;
    enabled: boolean;
}

class StickySettingsService {
    private cache = new Map<string, StickyMessage[]>();
    private cacheTime = 0;

    async getStickies(guildId: string): Promise<StickyMessage[]> {
        const now = Date.now();
        if (this.cache.has(guildId) && now - this.cacheTime < 10000) {
            return this.cache.get(guildId)!;
        }
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_sticky_messages');
            const messages = embed?.description ? JSON.parse(embed.description) : [];
            this.cache.set(guildId, messages);
            this.cacheTime = now;
            return messages;
        } catch {
            return [];
        }
    }

    async setSticky(guildId: string, channelId: string, content: string): Promise<StickyMessage[]> {
        const messages = await this.getStickies(guildId);
        const existing = messages.findIndex((m: StickyMessage) => m.channel === channelId);
        const entry: StickyMessage = { channel: channelId, content, enabled: true, messageId: null };
        if (existing >= 0) {
            messages[existing] = entry;
        } else {
            messages.push(entry);
        }
        await supabase.saveCustomEmbed(guildId, '_sticky_messages', { description: JSON.stringify(messages) });
        this.cache.set(guildId, messages);
        return messages;
    }

    async toggleSticky(guildId: string, channelId: string): Promise<StickyMessage[]> {
        const messages = await this.getStickies(guildId);
        const entry = messages.find((m: StickyMessage) => m.channel === channelId);
        if (entry) entry.enabled = !entry.enabled;
        await supabase.saveCustomEmbed(guildId, '_sticky_messages', { description: JSON.stringify(messages) });
        this.cache.set(guildId, messages);
        return messages;
    }

    async deleteSticky(guildId: string, channelId: string): Promise<StickyMessage[]> {
        const messages = await this.getStickies(guildId);
        const filtered = messages.filter((m: StickyMessage) => m.channel !== channelId);
        await supabase.saveCustomEmbed(guildId, '_sticky_messages', { description: JSON.stringify(filtered) });
        this.cache.set(guildId, filtered);
        return filtered;
    }

    async deleteAll(guildId: string): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_sticky_messages', { description: '[]' });
        this.cache.delete(guildId);
    }

    async updateMessageId(guildId: string, channelId: string, messageId: string): Promise<void> {
        const messages = await this.getStickies(guildId);
        const entry = messages.find((m: StickyMessage) => m.channel === channelId);
        if (entry) {
            entry.messageId = messageId;
            await supabase.saveCustomEmbed(guildId, '_sticky_messages', { description: JSON.stringify(messages) });
            this.cache.set(guildId, messages);
        }
    }
}

export interface StickyMessage {
    channel: string;
    content: string;
    enabled: boolean;
    messageId: string | null;
}

export const stickySettings = new StickySettingsService();