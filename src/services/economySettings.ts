import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface EconomyEntry {
    balance: number;
    dailyLastClaimed: string | null;
}

export interface EconomyData {
    balances: Record<string, EconomyEntry>;
}

const DEFAULT_DATA: EconomyData = {
    balances: {}
};

export class EconomySettingsService {
    async get(guildId: string): Promise<EconomyData> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_economy');
            let raw: any = {};
            if (embed?.description) {
                raw = JSON.parse(embed.description);
            }
            return {
                ...DEFAULT_DATA,
                ...raw
            };
        } catch (error) {
            logger.error(`Failed to get economy data for guild ${guildId}:`, error);
            return DEFAULT_DATA;
        }
    }

    async set(guildId: string, updates: Partial<EconomyData>): Promise<EconomyData> {
        const current = await this.get(guildId);
        const updated = { ...current, ...updates };
        try {
            await supabase.saveCustomEmbed(guildId, '_economy', {
                description: JSON.stringify(updated)
            });
        } catch (error) {
            logger.error(`Failed to save economy data for guild ${guildId}:`, error);
        }
        return updated;
    }

    async getBalance(guildId: string, userId: string): Promise<number> {
        const data = await this.get(guildId);
        return data.balances[userId]?.balance ?? 0;
    }

    async getEntry(guildId: string, userId: string): Promise<EconomyEntry> {
        const data = await this.get(guildId);
        return data.balances[userId] ?? { balance: 0, dailyLastClaimed: null };
    }

    async addCash(guildId: string, userId: string, amount: number): Promise<number> {
        if (amount <= 0) return (await this.getEntry(guildId, userId)).balance;
        const data = await this.get(guildId);
        const entry = data.balances[userId] ?? { balance: 0, dailyLastClaimed: null };
        entry.balance += amount;
        data.balances[userId] = entry;
        await this.set(guildId, { balances: data.balances });
        return entry.balance;
    }

    async removeCash(guildId: string, userId: string, amount: number): Promise<{ success: boolean; balance: number }> {
        if (amount <= 0) return { success: true, balance: (await this.getEntry(guildId, userId)).balance };
        const data = await this.get(guildId);
        const entry = data.balances[userId] ?? { balance: 0, dailyLastClaimed: null };
        if (entry.balance < amount) return { success: false, balance: entry.balance };
        entry.balance -= amount;
        data.balances[userId] = entry;
        await this.set(guildId, { balances: data.balances });
        return { success: true, balance: entry.balance };
    }

    async setDailyClaimed(guildId: string, userId: string): Promise<void> {
        const data = await this.get(guildId);
        const entry = data.balances[userId] ?? { balance: 0, dailyLastClaimed: null };
        entry.dailyLastClaimed = new Date().toISOString();
        data.balances[userId] = entry;
        await this.set(guildId, { balances: data.balances });
    }

    canClaimDaily(entry: EconomyEntry): boolean {
        if (!entry.dailyLastClaimed) return true;
        const last = new Date(entry.dailyLastClaimed);
        const now = new Date();
        return now.getTime() - last.getTime() >= 86400000;
    }

    async getLeaderboard(guildId: string, limit = 10): Promise<Array<{ userId: string; balance: number }>> {
        const data = await this.get(guildId);
        return Object.entries(data.balances)
            .map(([userId, entry]) => ({ userId, balance: entry.balance }))
            .sort((a, b) => b.balance - a.balance)
            .slice(0, limit);
    }
}

export const economy = new EconomySettingsService();
