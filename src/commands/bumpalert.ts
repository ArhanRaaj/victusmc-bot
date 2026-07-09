import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { bumpAlertService } from '../services/bumpAlertSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const bumpalertCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('bumpalert')
        .setDescription('Set up DISBOARD bump alerts')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Set bump alert channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel to alert in').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Role to ping').setRequired(false))
                .addStringOption(opt => opt.setName('message').setDescription('Custom alert message').setRequired(false).setMaxLength(500))
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable bump alerts')),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });

        const sub = interaction.options.getSubcommand();

        if (sub === 'set') {
            const channel = interaction.options.getChannel('channel', true);
            const role = interaction.options.getRole('role');
            const msg = interaction.options.getString('message') || '{user} Bump the server! It has been 2 hours!';
            await bumpAlertService.save(interaction.guildId!, {
                channelId: channel.id,
                pingRoleId: role?.id || null,
                message: msg,
            });
            const c = ComponentsV2.successContainer('Bump Alert Set',
                `Alerts will be sent to <#${channel.id}>${role ? `, pinging <@&${role.id}>` : ''}`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            await bumpAlertService.delete(interaction.guildId!);
            const c = ComponentsV2.errorContainer('Bump Alert Disabled', 'Bump alerts removed.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};