import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';

export const funCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('fun')
        .setDescription('Fun commands — use /8ball, /coinflip, /dice, /rate, /ship instead')
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.reply({ content: 'The fun commands are now individual: `/8ball`, `/coinflip`, `/dice`, `/rate`, `/ship`. Try one!' });
    },
};
