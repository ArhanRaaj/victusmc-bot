import { supabase } from './supabase.js';

export interface AutoThreadConfig {
    channelIds: string[];
    duration: number;
    name: string;
}

class AutoThreadService {
    async get(guildId: string): Promise<AutoThreadConfig | null> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_autothread');
            if (!embed?.description) return null;
            return JSON.parse(embed.description);
        } catch { return null; }
    }

    async save(guildId: string, config: AutoThreadConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_autothread', { description: JSON.stringify(config) });
    }

    async delete(guildId: string): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_autothread', { description: '' });
    }
}

export const autoThreadService = new AutoThreadService();