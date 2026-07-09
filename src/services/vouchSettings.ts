import { supabase } from './supabase.js';

interface VouchConfig {
    channelId: string;
    staffRoleId: string | null;
    enabled: boolean;
}

interface Vouch {
    fromId: string;
    toId: string;
    rating: number;
    comment: string;
    timestamp: number;
}

class VouchService {
    async getConfig(guildId: string): Promise<VouchConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_vouch_config');
            return embed?.description ? JSON.parse(embed.description) : { channelId: '', staffRoleId: null, enabled: false };
        } catch { return { channelId: '', staffRoleId: null, enabled: false }; }
    }

    async saveConfig(guildId: string, config: VouchConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_vouch_config', { description: JSON.stringify(config) });
    }

    async getVouches(guildId: string): Promise<Vouch[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_vouches');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch { return []; }
    }

    async addVouch(guildId: string, vouch: Vouch): Promise<void> {
        const vouches = await this.getVouches(guildId);
        vouches.push(vouch);
        await supabase.saveCustomEmbed(guildId, '_vouches', { description: JSON.stringify(vouches) });
    }

    async getUserVouches(guildId: string, userId: string): Promise<Vouch[]> {
        const vouches = await this.getVouches(guildId);
        return vouches.filter(v => v.toId === userId);
    }

    async getUserRating(guildId: string, userId: string): Promise<{ avg: number; count: number }> {
        const vouches = await this.getUserVouches(guildId, userId);
        if (vouches.length === 0) return { avg: 0, count: 0 };
        const sum = vouches.reduce((a, v) => a + v.rating, 0);
        return { avg: Math.round((sum / vouches.length) * 10) / 10, count: vouches.length };
    }
}

export const vouchService = new VouchService();