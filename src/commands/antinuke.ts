import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
    ChannelType, PermissionFlagsBits, RoleSelectMenuBuilder,
    SlashCommandBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import type { Command } from '../types/index.js';
import { antiNukeSettings } from '../services/antiNukeSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

const MODULES: Record<string, string> = {
    massKick: '<:Cross:1524363088621469737> Mass Kick',
    massBan: '<:Cross:1524363088621469737> Mass Ban',
    roleCreate: '<:Edit:1524363079675154433> Role Create',
    roleDelete: '<:Edit:1524363079675154433> Role Delete',
    channelCreate: '<:Message:1524363100734623836> Channel Create',
    channelDelete: '<:Message:1524363100734623836> Channel Delete',
};

export const antiNukeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Configure anti-nuke server protection (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('toggle').setDescription('Enable or disable anti-nuke protection')
        )
        .addSubcommand(sub =>
            sub.setName('status').setDescription('View anti-nuke configuration and module status')
        )
        .addSubcommand(sub =>
            sub.setName('setup').setDescription('Configure a protection module')
                .addStringOption(opt =>
                    opt.setName('module').setDescription('The module to configure').setRequired(true)
                        .addChoices(
                            { name: 'Mass Kick', value: 'massKick' },
                            { name: 'Mass Ban', value: 'massBan' },
                            { name: 'Role Create', value: 'roleCreate' },
                            { name: 'Role Delete', value: 'roleDelete' },
                            { name: 'Channel Create', value: 'channelCreate' },
                            { name: 'Channel Delete', value: 'channelDelete' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('whitelist').setDescription('Manage whitelisted roles')
                .addStringOption(opt =>
                    opt.setName('action').setDescription('Add or remove a role').setRequired(true)
                        .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
                )
                .addRoleOption(opt =>
                    opt.setName('role').setDescription('The role to add or remove').setRequired(true)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();
        const config = await antiNukeSettings.get(interaction.guildId!);

        if (sub === 'toggle') {
            const updated = await antiNukeSettings.set(interaction.guildId!, { enabled: !config.enabled });
            const container = ComponentsV2.baseContainer(updated.enabled ? ComponentsV2.Accents.success : ComponentsV2.Accents.warning);
            container.addTextDisplayComponents(ComponentsV2.text(
                `# <:Shield:1524363080570634240> Anti-Nuke\n\n` +
                `Anti-nuke protection has been **${updated.enabled ? 'enabled' : 'disabled'}**.`
            ));
            await interaction.editReply({ components: [container], flags: V2 });
            return;
        }

        if (sub === 'status') {
            await showStatus(interaction, config);
            return;
        }

        if (sub === 'setup') {
            const module = interaction.options.getString('module', true);
            await showModuleSetup(interaction, config, module);
            return;
        }

        if (sub === 'whitelist') {
            const action = interaction.options.getString('action', true);
            const role = interaction.options.getRole('role', true);
            const current = config.whitelistRoleIds || [];
            let updated: string[];
            if (action === 'add') {
                if (current.includes(role.id)) {
                    const c = ComponentsV2.warningContainer('Already Whitelisted', `<@&${role.id}> is already whitelisted.`);
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                updated = [...current, role.id];
            } else {
                if (!current.includes(role.id)) {
                    const c = ComponentsV2.warningContainer('Not Found', `<@&${role.id}> is not whitelisted.`);
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                updated = current.filter((id: string) => id !== role.id);
            }
            await antiNukeSettings.set(interaction.guildId!, { whitelistRoleIds: updated });
            const c = ComponentsV2.successContainer(
                'Whitelist Updated',
                `<@&${role.id}> has been **${action === 'add' ? 'added to' : 'removed from'}** the whitelist.`
            );
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('antinuke:')) return;
        const config = await antiNukeSettings.get(interaction.guildId!);
        const parts = interaction.customId.split(':');
        const action = parts[1];

        if (action === 'toggle') {
            const updated = await antiNukeSettings.set(interaction.guildId!, { enabled: !config.enabled });
            const c = ComponentsV2.successContainer('Anti-Nuke Toggled', `Protection is now **${updated.enabled ? 'enabled' : 'disabled'}**.`);
            await interaction.update({ components: [c] });
        } else if (action === 'log_channel') {
            const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder().setCustomId('antinuke:set_log').setPlaceholder('Select log channel...').addChannelTypes(ChannelType.GuildText)
            );
            await interaction.reply({ components: [row], flags: V2 });
        } else if (action === 'whitelist_roles') {
            const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                new RoleSelectMenuBuilder().setCustomId('antinuke:set_whitelist').setPlaceholder('Select whitelisted roles...').setMinValues(0).setMaxValues(25)
            );
            await interaction.reply({ components: [row], flags: V2 });
        } else if (action === 'trusted_roles') {
            const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                new RoleSelectMenuBuilder().setCustomId('antinuke:set_trusted').setPlaceholder('Select trusted roles...').setMinValues(0).setMaxValues(25)
            );
            await interaction.reply({ components: [row], flags: V2 });
        } else if (action === 'toggle_module') {
            const module = parts[2];
            const punishments: any = { ...config.punishments };
            const entry = punishments[module] || { enabled: true, threshold: 3, action: 'kick' };
            punishments[module] = { ...entry, enabled: !entry.enabled };
            await antiNukeSettings.set(interaction.guildId!, { punishments });
            const updated = await antiNukeSettings.get(interaction.guildId!);
            await showModuleSetup(interaction, updated, module);
        } else if (action === 'set_threshold') {
            const module = parts[2];
            const punishments: any = { ...config.punishments };
            const entry = punishments[module] || { enabled: true, threshold: 3, action: 'kick' };
            const next = Math.min(20, (entry.threshold || 1) + 1);
            punishments[module] = { ...entry, threshold: next };
            await antiNukeSettings.set(interaction.guildId!, { punishments });
            const updated = await antiNukeSettings.get(interaction.guildId!);
            await showModuleSetup(interaction, updated, module);
        } else if (action === 'set_action') {
            const module = parts[2];
            const punishments: any = { ...config.punishments };
            const entry = punishments[module] || { enabled: true, threshold: 3, action: 'kick' };
            const actions = ['kick', 'ban', 'none'];
            const idx = (actions.indexOf(entry.action) + 1) % actions.length;
            punishments[module] = { ...entry, action: actions[idx] };
            await antiNukeSettings.set(interaction.guildId!, { punishments });
            const updated = await antiNukeSettings.get(interaction.guildId!);
            await showModuleSetup(interaction, updated, module);
        }
    },

    async handleSelectMenu(interaction) {
        if (!interaction.customId.startsWith('antinuke:')) return;
        const action = interaction.customId.split(':')[1];
        const config = await antiNukeSettings.get(interaction.guildId!);

        if (action === 'set_log') {
            await antiNukeSettings.set(interaction.guildId!, { logChannelId: interaction.values[0] });
            const c = ComponentsV2.successContainer('Log Channel Set', `<#${interaction.values[0]}> will receive anti-nuke logs.`);
            await interaction.update({ components: [c] });
        } else if (action === 'set_whitelist') {
            await antiNukeSettings.set(interaction.guildId!, { whitelistRoleIds: interaction.values });
            const c = ComponentsV2.successContainer('Whitelist Updated', `Selected roles are now whitelisted from anti-nuke actions.`);
            await interaction.update({ components: [c] });
        } else if (action === 'set_trusted') {
            await antiNukeSettings.set(interaction.guildId!, { trustedRoleIds: interaction.values });
            const c = ComponentsV2.successContainer('Trusted Roles Updated', `Selected roles are now trusted.`);
            await interaction.update({ components: [c] });
        }
    },
};

async function showStatus(interaction: any, config: any) {
    const c = ComponentsV2.baseContainer(config.enabled ? ComponentsV2.Accents.success : ComponentsV2.Accents.warning);
    const text = `# <:Shield:1524363080570634240> Anti-Nuke Status\n\n` +
        `› **Protection:** ${config.enabled ? '<:Tick:1524363090626482326> Enabled' : '<:Cross:1524363088621469737> Disabled'}\n` +
        `› **Log Channel:** ${config.logChannelId ? `<#${config.logChannelId}>` : 'Not set'}\n` +
        `› **Whitelisted Roles:** ${config.whitelistRoleIds?.length ? config.whitelistRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}\n` +
        `› **Trusted Roles:** ${config.trustedRoleIds?.length ? config.trustedRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}\n\n` +
        `### Module Status\n` +
        Object.entries(MODULES).map(([key, label]) => {
            const punishment = config.punishments?.[key];
            const enabled = punishment?.enabled;
            return `› ${enabled ? '<:Tick:1524363090626482326>' : '<:Cross:1524363088621469737>'} ${label}${enabled ? ` — \`≥${punishment.threshold} triggers → ${punishment.action}\`` : ''}`;
        }).join('\n');

    c.addTextDisplayComponents(ComponentsV2.text(text));
    c.addSeparatorComponents(ComponentsV2.separator());
    c.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('antinuke:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId('antinuke:log_channel').setLabel('Set Log Channel').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('antinuke:whitelist_roles').setLabel('Whitelist Roles').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('antinuke:trusted_roles').setLabel('Trusted Roles').setStyle(ButtonStyle.Secondary),
        )
    );
    await interaction.editReply({ components: [c], flags: V2 });
}

async function showModuleSetup(interaction: any, config: any, module: string) {
    const punishment = config.punishments?.[module] || { enabled: true, threshold: 3, action: 'kick' };
    const label = MODULES[module] || module;

    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
    c.addTextDisplayComponents(ComponentsV2.text(
        `# ${label}\n\n` +
        `**Status:** ${punishment.enabled ? 'Enabled' : 'Disabled'}\n` +
        `**Threshold:** ${punishment.threshold || '-'} triggers\n` +
        `**Action:** ${punishment.action}\n\n` +
        `Use the buttons below to configure this module.`
    ));
    c.addSeparatorComponents(ComponentsV2.separator());
    c.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`antinuke:toggle_module:${module}`).setLabel(punishment.enabled ? 'Disable Module' : 'Enable Module').setStyle(punishment.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`antinuke:set_threshold:${module}`).setLabel('Cycle Threshold +1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`antinuke:set_action:${module}`).setLabel('Cycle Action').setStyle(ButtonStyle.Secondary),
        )
    );
    await interaction.editReply({ components: [c], flags: V2 });
}