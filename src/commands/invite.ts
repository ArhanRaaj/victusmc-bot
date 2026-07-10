import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { config } from '../config.js';

export const inviteCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get bot invite links')
        .setDMPermission(true),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(config.branding.color)
            .setTitle('Invite VictusMC Bot')
            .setDescription(
                'Add VictusMC Bot to your server or join the support server!\n\n' +
                `**[Invite Bot](https://discord.com/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands)**\n` +
                `**[Support Server](https://discord.gg/victusmc)**\n` +
                `**[Website](${config.branding.website})**`
            )
            .setFooter({ text: config.branding.name, iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: 64 });
    },
};