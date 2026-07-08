import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const shipCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Ship two names together')
        .setDMPermission(false)
        .addStringOption(o => o.setName('name1').setDescription('First name').setRequired(true).setMaxLength(50))
        .addStringOption(o => o.setName('name2').setDescription('Second name').setRequired(true).setMaxLength(50)),

    async execute(interaction) {
        const name1 = interaction.options.getString('name1', true);
        const name2 = interaction.options.getString('name2', true);
        const compatibility = randomInt(0, 100);
        const p1 = name1.slice(0, Math.ceil(name1.length / 2));
        const p2 = name2.slice(Math.floor(name2.length / 2));
        const shipName = p1 + p2;
        const heart = compatibility >= 70 ? '💖' : compatibility >= 40 ? '💛' : '💔';
        const bar = '🟥'.repeat(Math.floor(compatibility / 10)) + '⬜'.repeat(10 - Math.floor(compatibility / 10));
        const c = ComponentsV2.infoContainer('💕 Ship Generator',
            `**${name1}** × **${name2}**\n\n` +
            `Ship name: **${shipName}**\n${bar}\n**${compatibility}%** ${heart}`);
        await interaction.reply({ components: [c], flags: V2 });
    },
};
