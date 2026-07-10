import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { autoRoleService } from '../services/autoRoleSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const autoroleCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Auto-assign roles to new members')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('add').setDescription('Add a role for auto-assignment')
                .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(true))
                .addBooleanOption(opt => opt.setName('bots').setDescription('Also assign to bots').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove a role from auto-assignment')
                .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('list').setDescription('List auto-assign roles'))
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable auto-role')),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const role = interaction.options.getRole('role', true);
            const bots = interaction.options.getBoolean('bots') || false;
            await autoRoleService.addRole(interaction.guildId!, role.id, bots);
            const c = ComponentsV2.successContainer('Auto-Role Added',
                `<@&${role.id}> will be assigned to new ${bots ? 'bots' : 'members'}.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            const role = interaction.options.getRole('role', true);
            await autoRoleService.removeRole(interaction.guildId!, role.id);
            const c = ComponentsV2.successContainer('Auto-Role Removed', `<@&${role.id}> removed.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'list') {
            const config = await autoRoleService.get(interaction.guildId!);
            if (!config.enabled || (config.roleIds.length === 0 && config.botRoleIds.length === 0)) {
                const c = ComponentsV2.infoContainer('No Roles', 'No auto-roles configured.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const memberRoles = config.roleIds.map(id => `<@&${id}>`).join(', ') || 'None';
            const botRoles = config.botRoleIds.map(id => `<@&${id}>`).join(', ') || 'None';
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(
                `# <:Edit:1524363079675154433> Auto-Roles\n**Members:** ${memberRoles}\n**Bots:** ${botRoles}`
            ));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            await autoRoleService.save(interaction.guildId!, { roleIds: [], enabled: false, botRoleIds: [] });
            const c = ComponentsV2.errorContainer('Disabled', 'Auto-role disabled.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};