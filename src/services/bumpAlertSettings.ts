import { supabase } from './supabase.js';

interface BumpAlertConfig {
    channelId: string;
    pingRoleId: string | null;
    message: string;
}

class BumpAlertService {
    private cache = new Map<string, BumpAlertConfig>();

    async get(guildId: string): Promise<BumpAlertConfig | null> {
        if (this.cache.has(guildId)) return this.cache.get(guildId)!;
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_bumpalert');
            if (!embed?.description) return null;
            const cfg: BumpAlertConfig = JSON.parse(embed.description);
            this.cache.set(guildId, cfg);
            return cfg;
        } catch { return null; }
    }

    async save(guildId: string, config: BumpAlertConfig): Promise<void> {
        this.cache.set(guildId, config);
        await supabase.saveCustomEmbed(guildId, '_bumpalert', { description: JSON.stringify(config) });
    }

    async delete(guildId: string): Promise<void> {
        this.cache.delete(guildId);
        await supabase.saveCustomEmbed(guildId, '_bumpalert', { description: '' });
    }
}

export const bumpAlertService = new BumpAlertService();