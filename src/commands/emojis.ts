import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const emojisCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('emojis')
        .setDescription('List all server emojis')
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const emojis = interaction.guild?.emojis.cache;
        if (!emojis || emojis.size === 0) {
            const c = ComponentsV2.infoContainer('No Emojis', 'This server has no custom emojis.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        const staticEmojis = emojis.filter(e => !e.animated).map(e => `${e} \`:${e.name}:\``);
        const animEmojis = emojis.filter(e => e.animated).map(e => `${e} \`:${e.name}:\``);

        const parts: string[] = [];
        if (staticEmojis.length > 0) {
            parts.push(`### Static (${staticEmojis.length})\n${staticEmojis.join('\n')}`);
        }
        if (animEmojis.length > 0) {
            parts.push(`### Animated (${animEmojis.length})\n${animEmojis.join('\n')}`);
        }

        // Split into multiple messages if needed
        const full = parts.join('\n\n');
        const chunks = full.match(/[\s\S]{1,1900}/g) || [full];

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(`# <:Edit:1524363079675154433> Server Emojis (${emojis.size})\n\n${chunks[0]}`));
        await interaction.editReply({ components: [c], flags: V2 });
    },
};