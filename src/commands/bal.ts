import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { economy } from '../services/economySettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const balCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('bal')
        .setDescription('Check your cash balance')
        .setDMPermission(false)
        .addUserOption(o =>
            o.setName('user').setDescription('The user to check balance for (defaults to yourself)')
        ),

    async execute(interaction) {
        const guildId = interaction.guildId!;
        const user = interaction.options.getUser('user') || interaction.user;
        const balance = await economy.getBalance(guildId, user.id);

        const c = ComponentsV2.infoContainer('💰 Cash Balance',
            `**${user.username}** has **$${balance.toLocaleString()}** cash.\n\n` +
            `Earn more with \`/daily\` or try your luck with \`/mines\`, \`/coinflip\`, \`/dice\`, or \`/8ball\`!`);
        await interaction.reply({ components: [c], flags: V2 });
    },
};
