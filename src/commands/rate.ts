import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const rateCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('rate')
        .setDescription('Rate something on a scale')
        .setDMPermission(false)
        .addStringOption(o => o.setName('subject').setDescription('What to rate').setRequired(true).setMaxLength(200)),

    async execute(interaction) {
        const subject = interaction.options.getString('subject', true);
        const rating = randomInt(0, 10);
        const emojis = ['💩', '😕', '🤷', '👍', '⭐', '🌟'];
        const emoji = rating <= 2 ? emojis[0] : rating <= 4 ? emojis[1] : rating <= 6 ? emojis[2] : emojis[3];
        const bar = '🟩'.repeat(rating) + '⬜'.repeat(10 - rating);
        const c = ComponentsV2.infoContainer('📊 Rate-o-Meter',
            `**${subject}**\n\n${bar}\n**${rating}/10** ${emoji}`);
        await interaction.reply({ components: [c], flags: V2 });
    },
};
