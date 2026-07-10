import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { addStaffMember, removeStaffMember, listStaffMembers } from '../services/staffSettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const staffCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('Manage staff members')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a staff member')
                .addUserOption(o => o.setName('user').setDescription('The user to add as staff').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a staff member')
                .addUserOption(o => o.setName('user').setDescription('The user to remove').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all staff members')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand(true);
        const guildId = interaction.guildId!;

        if (sub === 'add') {
            const target = interaction.options.getUser('user', true);
            if (target.bot) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Cannot Add Bot', 'Bots cannot be staff members.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const added = addStaffMember(guildId, target.id, interaction.user.id);
            if (!added) {
                const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> Already Staff', `<@${target.id}> is already a staff member.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Staff Added', `<@${target.id}> has been added as a staff member.`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            const target = interaction.options.getUser('user', true);
            const removed = removeStaffMember(guildId, target.id);
            if (!removed) {
                const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> Not Found', `<@${target.id}> is not a staff member.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Staff Removed', `<@${target.id}> has been removed from staff.`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'list') {
            const members = listStaffMembers(guildId);
            if (members.length === 0) {
                const c = ComponentsV2.infoContainer('<:Info:1524363004823470120> No Staff Members', 'No staff members have been added in this server.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const list = members.map(e => `<@${e.userId}> — added by <@${e.addedBy}> on <t:${Math.floor(new Date(e.addedAt).getTime() / 1000)}:D>`).join('\n');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Shield:1524362964772196422> Staff Members\n\n${list}`));
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }
    },
};
