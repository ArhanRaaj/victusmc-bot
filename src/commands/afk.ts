import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { supabase } from '../services/supabase.js';
import { logger } from '../utils/logger.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

export const afkCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your status to AFK (Away From Keyboard)')
        .setDMPermission(false)
        .addStringOption((o) =>
            o.setName('reason').setDescription('The reason you are AFK').setRequired(false).setMaxLength(100)
        ),

    async execute(interaction) {
        const reason = interaction.options.getString('reason') || 'AFK';
        const guildId = interaction.guildId!;
        const userId = interaction.user.id;
        const timestamp = new Date().toISOString();

        try {
            // Save AFK status to Supabase using custom_embeds table
            // Storing: reason, timestamp, and an empty mentions array
            const afkData = {
                reason,
                timestamp,
                mentions: []
            };

            await supabase.saveCustomEmbed(guildId, `_afk_${userId}`, {
                description: JSON.stringify(afkData)
            });

            const container = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            container.addTextDisplayComponents(ComponentsV2.text(
                `<:Afk:1524363042731724923> **${interaction.user.username}** is now AFK.\n\n` +
                `› **Reason:** ${reason}\n` +
                `› **Since:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                `› **Scope:** Server Only\n\n` +
                `-# You will be notified if someone mentions you.`
            ));

            await interaction.reply({
                components: [container],
                flags: [ComponentsV2.IS_COMPONENTS_V2]
            });
        } catch (error) {
            logger.error('Failed to set AFK status:', error);
            await interaction.reply({ content: '<:Cross:1524363088621469737> Failed to set your AFK status. Please try again.' });
        }
    }
};

