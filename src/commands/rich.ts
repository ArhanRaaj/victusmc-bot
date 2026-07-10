import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { economy } from '../services/economySettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const richCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('rich')
        .setDescription('Show the wealth leaderboard')
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const entries = await economy.getLeaderboard(interaction.guildId!, 15);

        if (entries.length === 0) {
            const c = ComponentsV2.infoContainer('No Data', 'No economy data yet.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        const lines = entries.map((e, i) => {
            const rank = medals[i] || `**#${i + 1}**`;
            return `${rank} <@${e.userId}> — **${e.balance.toLocaleString()}** coins`;
        }).join('\n');

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
        c.addTextDisplayComponents(ComponentsV2.text(`# <: <:coin:780495126019473419> Wealth Leaderboard\n\n${lines}`));
        await interaction.editReply({ components: [c], flags: V2 });
    },
};