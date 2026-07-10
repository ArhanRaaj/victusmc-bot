import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { Command } from '../types/index.js';
import { reportService } from '../services/reportSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const reportCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a user to staff')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('user').setDescription('Report a user')
                .addUserOption(opt => opt.setName('user').setDescription('The user to report').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Why are you reporting this user?').setRequired(true).setMaxLength(500))
        )
        .addSubcommand(sub =>
            sub.setName('setup').setDescription('Set report channel (Admin)')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for reports').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable reports (Admin)')),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'setup') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Admin required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const channel = interaction.options.getChannel('channel', true);
            await reportService.saveConfig(interaction.guildId!, { channelId: channel.id, enabled: true });
            const c = ComponentsV2.successContainer('Report Channel Set', `Reports will be sent to <#${channel.id}>.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Admin required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            await reportService.saveConfig(interaction.guildId!, { channelId: null, enabled: false });
            const c = ComponentsV2.errorContainer('Reports Disabled', 'Report command disabled.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'user') {
            const target = interaction.options.getUser('user', true);
            const reason = interaction.options.getString('reason', true);

            if (target.id === interaction.user.id) {
                const c = ComponentsV2.errorContainer('Cannot Report Yourself', '...seriously?');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const config = await reportService.getConfig(interaction.guildId!);
            if (!config.enabled || !config.channelId) {
                const c = ComponentsV2.errorContainer('Not Configured', 'Reports are not set up on this server.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const reportChannel = interaction.guild?.channels.cache.get(config.channelId);
            if (reportChannel?.isTextBased()) {
                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.danger);
                c.addTextDisplayComponents(ComponentsV2.text(
                    `## <:Cross:1524363088621469737> Report Received\n\n` +
                    `**From:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
                    `**Reported User:** <@${target.id}> (${target.tag})\n` +
                    `**Channel:** <#${interaction.channelId}>\n` +
                    `**Reason:** ${reason}\n\n` +
                    `-# <t:${Math.floor(Date.now() / 1000)}:R>`
                ));
                await reportChannel.send({ components: [c], flags: V2 }).catch(() => {});
            }

            const c = ComponentsV2.successContainer('Report Submitted',
                `Your report against **${target.tag}** has been sent to staff.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};