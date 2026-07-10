import { supabase } from './supabase.js';
import { economy } from './economySettings.js';

export interface ShopItem {
    id: string;
    name: string;
    price: number;
    roleId: string | null;
    description: string;
}

class ShopService {
    async getItems(guildId: string): Promise<ShopItem[]> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_shop');
            return embed?.description ? JSON.parse(embed.description) : [];
        } catch { return []; }
    }

    async saveItems(guildId: string, items: ShopItem[]): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_shop', { description: JSON.stringify(items) });
    }

    async addItem(guildId: string, item: ShopItem): Promise<void> {
        const items = await this.getItems(guildId);
        items.push(item);
        await this.saveItems(guildId, items);
    }

    async removeItem(guildId: string, itemId: string): Promise<boolean> {
        const items = await this.getItems(guildId);
        const filtered = items.filter(i => i.id !== itemId);
        if (filtered.length === items.length) return false;
        await this.saveItems(guildId, filtered);
        return true;
    }

    async buyItem(guildId: string, userId: string, itemId: string): Promise<{ success: boolean; reason?: string }> {
        const items = await this.getItems(guildId);
        const item = items.find(i => i.id === itemId);
        if (!item) return { success: false, reason: 'Item not found.' };

        const balance = await economy.getBalance(guildId, userId);
        if (balance < item.price) return { success: false, reason: `You need **${item.price.toLocaleString()}** coins but only have **${balance.toLocaleString()}**.` };

        await economy.removeCash(guildId, userId, item.price);
        return { success: true };
    }
}

export const shopService = new ShopService();