import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { vouchService } from '../services/vouchSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const vouchCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('vouch')
        .setDescription('Vouch system')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('setup').setDescription('Configure vouch channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for vouches').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Staff role').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('add').setDescription('Vouch for a user')
                .addUserOption(opt => opt.setName('user').setDescription('User to vouch for').setRequired(true))
                .addIntegerOption(opt => opt.setName('rating').setDescription('Rating 1-5').setRequired(true).setMinValue(1).setMaxValue(5))
                .addStringOption(opt => opt.setName('comment').setDescription('Comment').setRequired(false).setMaxLength(300))
        )
        .addSubcommand(sub =>
            sub.setName('view').setDescription('View a user\'s vouches')
                .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('disable').setDescription('Disable vouch system')
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'setup') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Administrator permission required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const channel = interaction.options.getChannel('channel', true);
            const role = interaction.options.getRole('role');
            await vouchService.saveConfig(interaction.guildId!, {
                channelId: channel.id,
                staffRoleId: role?.id || null,
                enabled: true,
            });
            const c = ComponentsV2.successContainer('Vouch Setup', `Vouches will be logged in <#${channel.id}>`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'add') {
            const config = await vouchService.getConfig(interaction.guildId!);
            if (!config.enabled) {
                const c = ComponentsV2.errorContainer('Not Enabled', 'Vouch system is not set up.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const target = interaction.options.getUser('user', true);
            const rating = interaction.options.getInteger('rating', true);
            const comment = interaction.options.getString('comment') || '';

            if (target.id === interaction.user.id) {
                const c = ComponentsV2.errorContainer('Cannot Self-Vouch', 'You cannot vouch for yourself.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            await vouchService.addVouch(interaction.guildId!, {
                fromId: interaction.user.id,
                toId: target.id,
                rating,
                comment,
                timestamp: Date.now(),
            });

            const logChannel = interaction.guild?.channels.cache.get(config.channelId);
            if (logChannel?.isTextBased()) {
                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
                c.addTextDisplayComponents(ComponentsV2.text(
                    `## <:Edit:1524363079675154433> New Vouch\n**To:** <@${target.id}>\n**From:** <@${interaction.user.id}>\n**Rating:** ${'⭐'.repeat(rating)}\n**Comment:** ${comment || 'No comment'}`
                ));
                await logChannel.send({ components: [c], flags: V2 }).catch(() => {});
            }

            const c = ComponentsV2.successContainer('Vouch Added', `You vouched for ${target.username} (${rating}/5)`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'view') {
            const target = interaction.options.getUser('user', true);
            const { avg, count } = await vouchService.getUserRating(interaction.guildId!, target.id);
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(
                `## <: <:user:780495126019473419> Vouches for ${target.username}\n**Rating:** ${avg}/5 (${count} vouches)`
            ));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Administrator permission required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            await vouchService.saveConfig(interaction.guildId!, { channelId: '', staffRoleId: null, enabled: false });
            const c = ComponentsV2.errorContainer('Disabled', 'Vouch system disabled.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};