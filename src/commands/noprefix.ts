import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { addNoprefixUser, removeNoprefixUser, listNoprefixUsers } from '../services/noprefixSettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const noprefixCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('noprefix')
        .setDescription('Manage users who can run commands without a prefix')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Grant a user noprefix access')
                .addUserOption(o => o.setName('user').setDescription('The user to grant access to').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Revoke noprefix access from a user')
                .addUserOption(o => o.setName('user').setDescription('The user to revoke access from').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all users with noprefix access')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand(true);
        const guildId = interaction.guildId!;

        if (sub === 'add') {
            const target = interaction.options.getUser('user', true);
            if (target.bot) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Cannot Add Bot', 'Bots cannot be granted noprefix access.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const added = await addNoprefixUser(guildId, target.id, interaction.user.id);
            if (!added) {
                const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> Already Granted', `<@${target.id}> already has noprefix access.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Noprefix Granted', `<@${target.id}> can now run commands without a prefix.`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            const target = interaction.options.getUser('user', true);
            const removed = await removeNoprefixUser(guildId, target.id);
            if (!removed) {
                const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> Not Found', `<@${target.id}> does not have noprefix access.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Noprefix Revoked', `<@${target.id}> can no longer run commands without a prefix.`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'list') {
            const users = listNoprefixUsers(guildId);
            if (users.length === 0) {
                const c = ComponentsV2.infoContainer('<:Info:1524363004823470120> No Noprefix Users', 'No users have been granted noprefix access in this server.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const list = users.map(e => `<@${e.userId}> — added by <@${e.addedBy}> on <t:${Math.floor(new Date(e.addedAt).getTime() / 1000)}:D>`).join('\n');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Users:1524363103054069911> Noprefix Users\n\n${list}`));
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }
    },
};
