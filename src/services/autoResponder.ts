import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface AutoResponder {
    trigger: string;
    response: string;
    matchType: 'exact' | 'contains' | 'starts';
    enabled: boolean;
    ignoreCase: boolean;
}

class AutoResponderService {
    async get(guildId: string): Promise<AutoResponder[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_autoresponder');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch {
            return [];
        }
    }

    async save(guildId: string, responders: AutoResponder[]): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_autoresponder', { description: JSON.stringify(responders) });
    }

    async add(guildId: string, trigger: string, response: string, matchType: string, ignoreCase: boolean): Promise<AutoResponder[]> {
        const responders = await this.get(guildId);
        responders.push({ trigger, response, matchType: matchType as any, enabled: true, ignoreCase });
        await this.save(guildId, responders);
        return responders;
    }

    async edit(guildId: string, index: number, updates: Partial<AutoResponder>): Promise<AutoResponder[]> {
        const responders = await this.get(guildId);
        if (index < 0 || index >= responders.length) return responders;
        responders[index] = { ...responders[index], ...updates };
        await this.save(guildId, responders);
        return responders;
    }

    async remove(guildId: string, index: number): Promise<AutoResponder[]> {
        const responders = await this.get(guildId);
        if (index < 0 || index >= responders.length) return responders;
        responders.splice(index, 1);
        await this.save(guildId, responders);
        return responders;
    }

    async deleteAll(guildId: string): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_autoresponder', { description: '[]' });
    }

    match(content: string, responder: AutoResponder): boolean {
        let text = content;
        let trigger = responder.trigger;
        if (responder.ignoreCase) {
            text = text.toLowerCase();
            trigger = trigger.toLowerCase();
        }
        switch (responder.matchType) {
            case 'exact': return text === trigger;
            case 'starts': return text.startsWith(trigger);
            case 'contains': return text.includes(trigger);
            default: return false;
        }
    }
}

export const autoResponder = new AutoResponderService();