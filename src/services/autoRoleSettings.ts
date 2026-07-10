import { supabase } from './supabase.js';

interface AutoRoleConfig {
    roleIds: string[];
    enabled: boolean;
    botRoleIds: string[];
}

class AutoRoleService {
    async get(guildId: string): Promise<AutoRoleConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_autorole');
            return embed?.description ? JSON.parse(embed.description) : { roleIds: [], enabled: false, botRoleIds: [] };
        } catch { return { roleIds: [], enabled: false, botRoleIds: [] }; }
    }

    async save(guildId: string, config: AutoRoleConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_autorole', { description: JSON.stringify(config) });
    }

    async addRole(guildId: string, roleId: string, isBot: boolean): Promise<void> {
        const config = await this.get(guildId);
        if (isBot) {
            if (!config.botRoleIds.includes(roleId)) config.botRoleIds.push(roleId);
        } else {
            if (!config.roleIds.includes(roleId)) config.roleIds.push(roleId);
        }
        config.enabled = true;
        await this.save(guildId, config);
    }

    async removeRole(guildId: string, roleId: string): Promise<void> {
        const config = await this.get(guildId);
        config.roleIds = config.roleIds.filter(id => id !== roleId);
        config.botRoleIds = config.botRoleIds.filter(id => id !== roleId);
        if (config.roleIds.length === 0 && config.botRoleIds.length === 0) config.enabled = false;
        await this.save(guildId, config);
    }
}

export const autoRoleService = new AutoRoleService();