import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { getLeaderboard, calculateLevel } from '../services/levelingSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const leaderboardCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the XP leaderboard')
        .setDMPermission(false)
        .addStringOption(opt =>
            opt.setName('type').setDescription('Leaderboard type')
                .addChoices(
                    { name: 'Overall', value: 'overall' },
                    { name: 'Chat XP', value: 'chat' },
                    { name: 'Voice XP', value: 'voice' }
                )),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const type = interaction.options.getString('type') || 'overall';
        const entries = getLeaderboard(interaction.guildId!, 15);

        if (entries.length === 0) {
            const c = ComponentsV2.infoContainer('No Data', 'No XP data yet.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        let sortKey: 'totalXp' | 'chatXp' | 'voiceXp' = 'totalXp';
        let label = 'Overall';
        if (type === 'chat') { sortKey = 'chatXp'; label = 'Chat'; }
        if (type === 'voice') { sortKey = 'voiceXp'; label = 'Voice'; }

        const sorted = [...entries].sort((a, b) => b[sortKey] - a[sortKey]);
        const medals = ['🥇', '🥈', '🥉'];
        const lines = sorted.map((e, i) => {
            const rank = medals[i] || `**#${i + 1}**`;
            return `${rank} <@${e.userId}> — Level **${e.level}** — ${e[sortKey].toLocaleString()} XP`;
        }).join('\n');

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(
            `# <:Stars:1524363036389937212> ${label} Leaderboard\n\n${lines}`
        ));
        await interaction.editReply({ components: [c], flags: V2 });
    },
};