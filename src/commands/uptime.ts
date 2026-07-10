import { SlashCommandBuilder, version as djsVersion } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { config } from '../config.js';
import { version } from '../../package.json' with { type: 'json' };

const V2 = ComponentsV2.IS_COMPONENTS_V2;
const startTime = Date.now();

export const uptimeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Show bot statistics and uptime')
        .setDMPermission(true),

    async execute(interaction) {
        const uptime = Date.now() - startTime;
        const seconds = Math.floor(uptime / 1000);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const uptimeStr = `${days}d ${hours}h ${minutes}m ${secs}s`;
        const guildCount = interaction.client.guilds.cache.size;
        const userCount = interaction.client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
        const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(
            `# <:Stars:1524363036389937212> ${config.branding.name} Stats\n\n` +
            `**Uptime:** ${uptimeStr}\n` +
            `**Servers:** ${guildCount.toLocaleString()}\n` +
            `**Users:** ${userCount.toLocaleString()}\n` +
            `**Memory:** ${memory} MB\n` +
            `**Discord.js:** v${djsVersion}\n` +
            `**Node.js:** ${process.version}\n` +
            `**Bot Version:** v${version}\n\n` +
            `-# Started <t:${Math.floor(startTime / 1000)}:R>`
        ));
        await interaction.reply({ components: [c], flags: V2 });
    },
};