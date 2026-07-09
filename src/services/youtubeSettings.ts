import { supabase } from './supabase.js';

export interface YouTubeConfig {
    channelId: string;
    pingRoleId: string | null;
    message: string;
    lastVideoId: string | null;
}

class YouTubeService {
    async get(guildId: string): Promise<YouTubeConfig | null> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_youtube');
            if (!embed?.description) return null;
            return JSON.parse(embed.description);
        } catch { return null; }
    }

    async save(guildId: string, config: YouTubeConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_youtube', { description: JSON.stringify(config) });
    }

    async delete(guildId: string): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_youtube', { description: '' });
    }
}

export const youtubeService = new YouTubeService();