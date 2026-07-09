import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { youtubeService } from '../services/youtubeSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const youtubeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('youtube')
        .setDescription('YouTube notification setup')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('setup').setDescription('Set YouTube alert channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for alerts').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Role to ping').setRequired(false))
                .addStringOption(opt => opt.setName('message').setDescription('Custom message').setRequired(false).setMaxLength(500))
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable YouTube alerts')),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'setup') {
            const channel = interaction.options.getChannel('channel', true);
            const role = interaction.options.getRole('role');
            const msg = interaction.options.getString('message') || 'New YouTube video!';
            await youtubeService.save(interaction.guildId!, {
                channelId: channel.id,
                pingRoleId: role?.id || null,
                message: msg,
                lastVideoId: null,
            });
            const c = ComponentsV2.successContainer('YouTube Alert Set',
                `Alerts to <#${channel.id}>${role ? `, pinging <@&${role.id}>` : ''}`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            await youtubeService.delete(interaction.guildId!);
            const c = ComponentsV2.errorContainer('Disabled', 'YouTube alerts removed.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};