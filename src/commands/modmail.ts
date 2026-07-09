import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types/index.js';
import { modMailService } from '../services/modMailSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

async function ensureModMailChannel(interaction: ChatInputCommandInteraction, userId: string): Promise<string | null> {
    const config = await modMailService.getConfig(interaction.guildId!);
    if (!config.enabled || !config.categoryId) return null;

    const guild = interaction.guild!;
    const existing = await modMailService.getOpenThread(interaction.guildId!, userId);
    if (existing) {
        const ch = guild.channels.cache.get(existing.channelId);
        if (ch) return ch.id;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    const name = member?.user.username || userId.slice(0, 20);

    const channel = await guild.channels.create({
        name: `modmail-${name}`,
        type: ChannelType.GuildText,
        parent: config.categoryId,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ...(config.staffRoleId ? [{ id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
        ],
    }).catch(() => null);
    if (!channel) return null;

    await modMailService.openThread(interaction.guildId!, userId, channel.id);
    await channel.send({ content: `ModMail thread opened for <@${userId}>. Type your response here.` });
    return channel.id;
}

export const modmailCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('modmail')
        .setDescription('ModMail system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('setup').setDescription('Setup ModMail category')
                .addChannelOption(opt => opt.setName('category').setDescription('Category for mail threads').setRequired(true).addChannelTypes(ChannelType.GuildCategory))
                .addRoleOption(opt => opt.setName('role').setDescription('Staff role with access').setRequired(false))
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable ModMail')),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'setup') {
            const category = interaction.options.getChannel('category', true);
            const role = interaction.options.getRole('role');
            await modMailService.saveConfig(interaction.guildId!, {
                categoryId: category.id,
                staffRoleId: role?.id || null,
                enabled: true,
            });
            const c = ComponentsV2.successContainer('ModMail Setup',
                `Category: ${category.name}\nStaff Role: ${role ? `<@&${role.id}>` : '@everyone'}\n-# Users can DM the bot to start a thread.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            await modMailService.saveConfig(interaction.guildId!, { categoryId: null, staffRoleId: null, enabled: false });
            const c = ComponentsV2.errorContainer('ModMail Disabled', 'Users can no longer open ModMail threads.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};

export const modmailCloseCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Close this ModMail thread')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ flags: V2 });
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased()) return;

        const thread = await modMailService.getThreadByChannel(interaction.guildId!, channel.id);
        if (!thread) {
            const c = ComponentsV2.errorContainer('Not a ModMail', 'This channel is not a ModMail thread.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        await modMailService.closeThread(interaction.guildId!, thread.userId);
        const user = interaction.client.users.cache.get(thread.userId);
        if (user) user.send({ content: 'Your ModMail thread has been closed by staff.' }).catch(() => {});
        await channel.delete().catch(() => {});
    },
};