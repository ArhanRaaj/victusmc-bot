import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags,
    PermissionFlagsBits, 
    SlashCommandBuilder, 
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import type { Command } from '../types/index.js';
import { reactRolesSettings, ReactRolesConfig, ReactRolePanel, RoleMapping } from '../services/reactRolesSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
// In-memory cache for user creation flows
// Key: userId-guildId
const activeBuilders = new Map<string, { panelId: string; step: string }>();

function getBuilderKey(userId: string, guildId: string): string {
    return `${userId}-${guildId}`;
}

function renderPanelManager(config: ReactRolesConfig): any {
    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.primary);

    let text = `# 🎭 Reaction Roles Manager\n` +
        `Create self-assignable role panels for your members.\n\n`;

    if (config.panels.length === 0) {
        text += `*No reaction role panels configured. Click the button below to create one.*`;
    } else {
        text += `### Active Panels:\n`;
        config.panels.forEach(p => {
            text += `• **${p.title}** (\`${p.id}\`) — Style: \`${p.style}\` | Mappings: \`${p.mappings.length}\`\n`;
        });
    }

    c.addTextDisplayComponents(ComponentsV2.text(text))
     .addSeparatorComponents(ComponentsV2.separator());

    // Row 1: Actions
    const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('rr_wiz:create')
            .setLabel('Create New Panel ➕')
            .setStyle(ButtonStyle.Success)
    );

    c.addActionRowComponents(btnRow);

    if (config.panels.length > 0) {
        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('rr_wiz:edit_select')
                .setPlaceholder('Select a panel to edit...')
                .addOptions(config.panels.map(p => ({
                    label: p.title.slice(0, 100),
                    value: p.id
                })))
        );
        c.addActionRowComponents(selectMenu);
    }

    return c;
}

function renderPanelEditor(panel: ReactRolePanel): any {
    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);

    const mappingsList = panel.mappings.length > 0
        ? panel.mappings.map((m, idx) => `\`${idx + 1}.\` ${m.emoji} **${m.label}** → <@&${m.roleId}>`).join('\n')
        : '_No roles mapped yet_';

    const text = `# ⚙️ Panel Editor: ${panel.title}\n` +
        `› **Description:** *${panel.description}*\n` +
        `› **Style:** \`${panel.style.toUpperCase()}\`\n\n` +
        `### Configured Roles:\n${mappingsList}`;

    c.addTextDisplayComponents(ComponentsV2.text(text))
     .addSeparatorComponents(ComponentsV2.separator());

    // Row 1: Add Mapping & Edit Info
    const editRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`rr_wiz:add_role:${panel.id}`)
            .setLabel('Add Role 🎭')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`rr_wiz:edit_details:${panel.id}`)
            .setLabel('Edit Info 📝')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`rr_wiz:toggle_style:${panel.id}`)
            .setLabel(`Change Style: ${panel.style === 'buttons' ? 'Select Menu ⬇️' : 'Buttons ⏹️'}`)
            .setStyle(ButtonStyle.Secondary)
    );

    // Row 2: Actions
    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('rr_wiz:back_list')
            .setLabel('⬅️ Back to List')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`rr_wiz:publish:${panel.id}`)
            .setLabel('Publish Panel 📣')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(panel.mappings.length === 0),
        new ButtonBuilder()
            .setCustomId(`rr_wiz:delete:${panel.id}`)
            .setLabel('Delete Panel 🗑️')
            .setStyle(ButtonStyle.Danger)
    );

    if (panel.mappings.length > 0) {
        const mappingSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`rr_wiz:select_mapping:${panel.id}`)
                .setPlaceholder('Select a role mapping to edit or remove...')
                .addOptions(panel.mappings.map((m, idx) => ({
                    label: `${m.label}`.slice(0, 100),
                    value: String(idx),
                    emoji: m.emoji
                })))
        );
        c.addActionRowComponents(mappingSelect);
    }

    c.addActionRowComponents(editRow);
    c.addActionRowComponents(actionRow);

    return c;
}

function renderMappingDetail(panel: ReactRolePanel, idx: number): any {
    const m = panel.mappings[idx];
    if (!m) return renderPanelEditor(panel);

    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
    const text =
        `# ⚙️ Edit Role Mapping\n\n` +
        `**Mapping #${idx + 1}**\n` +
        `› **Label:** ${m.label}\n` +
        `› **Emoji:** ${m.emoji}\n` +
        `› **Role:** <@&${m.roleId}>\n\n` +
        `What would you like to do?`;

    c.addTextDisplayComponents(ComponentsV2.text(text))
     .addSeparatorComponents(ComponentsV2.separator());

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`rr_wiz:back_editor:${panel.id}`)
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`rr_wiz:edit_mapping:${panel.id}:${idx}`)
            .setLabel('✏️ Edit Mapping')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`rr_wiz:remove_mapping:${panel.id}:${idx}`)
            .setLabel('🗑️ Remove')
            .setStyle(ButtonStyle.Danger)
    );

    c.addActionRowComponents(actionRow);
    return c;
}

export function buildPublishedPanelPayload(panel: ReactRolePanel): any {
    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.purple);
    c.addTextDisplayComponents(ComponentsV2.text(`# ${panel.title}\n\n${panel.description}`));

    if (panel.mappings.length === 0) return c;

    if (panel.style === 'buttons') {
        let row = new ActionRowBuilder<ButtonBuilder>();
        panel.mappings.forEach((m, idx) => {
            if (row.components.length >= 5) {
                c.addActionRowComponents(row);
                row = new ActionRowBuilder<ButtonBuilder>();
            }
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`rr_btn:${panel.id}:${idx}`)
                    .setLabel(m.label)
                    .setEmoji(m.emoji)
                    .setStyle(ButtonStyle.Secondary)
            );
        });
        if (row.components.length > 0) c.addActionRowComponents(row);
    } else {
        const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`rr_select:${panel.id}`)
                .setPlaceholder('Choose roles to toggle...')
                .addOptions(panel.mappings.map((m, idx) => ({
                    label: m.label,
                    value: String(idx),
                    emoji: m.emoji
                })))
        );
        c.addActionRowComponents(select);
    }

    return c;
}

export const reactRolesCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('reactroles')
        .setDescription('Create and manage self-assignable role panels')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Open the reaction roles panel setup dashboard')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand(true);
        if (sub === 'setup') {
            const config = await reactRolesSettings.get(interaction.guildId!);
            const dashboard = renderPanelManager(config);
            await interaction.reply({
                components: [dashboard],
                flags: V2
            });
        }
    },

    async handleButton(interaction) {
        const guildId = interaction.guildId!;
        const config = await reactRolesSettings.get(guildId);

        // Wizard creation/editing button routers
        if (interaction.customId.startsWith('rr_wiz:')) {
            const action = interaction.customId.split(':')[1];

            if (action === 'create') {
                const modal = new ModalBuilder()
                    .setCustomId('rr_wiz_modal:create')
                    .setTitle('Create Reaction Roles Panel');
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('title')
                            .setLabel('Panel Title')
                            .setPlaceholder('Get Roles Here!')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('description')
                            .setLabel('Panel Description')
                            .setPlaceholder('Click the buttons below to assign yourself roles.')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    )
                );
                await interaction.showModal(modal);
            }
            else if (action === 'back_list') {
                await interaction.update({
                    components: [renderPanelManager(config)],
                    embeds: []
                });
            }
            else if (action === 'toggle_style') {
                const panelId = interaction.customId.split(':')[2];
                const panel = config.panels.find(p => p.id === panelId);
                if (panel) {
                    panel.style = panel.style === 'buttons' ? 'select' : 'buttons';
                    await reactRolesSettings.set(guildId, config);
                    await interaction.update({
                        components: [renderPanelEditor(panel)],
                        embeds: []
                    });
                }
            }
            else if (action === 'delete') {
                const panelId = interaction.customId.split(':')[2];
                const updatedPanels = config.panels.filter(p => p.id !== panelId);
                await reactRolesSettings.set(guildId, { panels: updatedPanels });
                const newConfig = await reactRolesSettings.get(guildId);
                await interaction.update({
                    components: [renderPanelManager(newConfig)],
                    embeds: []
                });
            }
            else if (action === 'add_role') {
                const panelId = interaction.customId.split(':')[2];
                const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId(`rr_wiz:pick_role:${panelId}`)
                        .setPlaceholder('Select a role to add...')
                        .setMinValues(1)
                        .setMaxValues(1)
                );
                await interaction.reply({ components: [row], flags: V2 | MessageFlags.Ephemeral });
            }
            else if (action === 'edit_details') {
                const panelId = interaction.customId.split(':')[2];
                const panel = config.panels.find(p => p.id === panelId);
                if (panel) {
                    const modal = new ModalBuilder()
                        .setCustomId(`rr_wiz_modal:edit_details:${panelId}`)
                        .setTitle('Edit Panel Info');
                    modal.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('title')
                                .setLabel('Panel Title')
                                .setValue(panel.title)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('description')
                                .setLabel('Panel Description')
                                .setValue(panel.description)
                                .setStyle(TextInputStyle.Paragraph)
                                .setRequired(true)
                        )
                    );
                    await interaction.showModal(modal);
                }
            }
            else if (action === 'back_editor') {
                const panelId = interaction.customId.split(':')[2];
                const panel = config.panels.find(p => p.id === panelId);
                if (panel) {
                    await interaction.update({
                        components: [renderPanelEditor(panel)],
                        embeds: []
                    });
                }
            }
            else if (action === 'edit_mapping') {
                const panelId = interaction.customId.split(':')[2];
                const idx = parseInt(interaction.customId.split(':')[3], 10);
                const panel = config.panels.find(p => p.id === panelId);
                const mapping = panel?.mappings[idx];
                if (panel && mapping) {
                    const modal = new ModalBuilder()
                        .setCustomId(`rr_wiz_modal:edit_mapping:${panelId}:${idx}`)
                        .setTitle('Edit Role Mapping');
                    modal.addComponents(
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('label')
                                .setLabel('Display Label')
                                .setValue(mapping.label)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder<TextInputBuilder>().addComponents(
                            new TextInputBuilder()
                                .setCustomId('emoji')
                                .setLabel('Emoji')
                                .setValue(mapping.emoji)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );
                    await interaction.showModal(modal);
                }
            }
            else if (action === 'remove_mapping') {
                const panelId = interaction.customId.split(':')[2];
                const idx = parseInt(interaction.customId.split(':')[3], 10);
                const panel = config.panels.find(p => p.id === panelId);
                if (panel && idx >= 0 && idx < panel.mappings.length) {
                    panel.mappings.splice(idx, 1);
                    await reactRolesSettings.set(guildId, config);
                    await interaction.update({
                        components: [renderPanelEditor(panel)],
                        embeds: []
                    });
                }
            }
            else if (action === 'publish') {
                const panelId = interaction.customId.split(':')[2];
                const panel = config.panels.find(p => p.id === panelId);
                if (panel && interaction.channel) {
                    const payload = buildPublishedPanelPayload(panel);
                    const postedMsg = await (interaction.channel as any).send({
                        components: [payload],
                        flags: V2
                    }).catch(() => null);

                    if (postedMsg) {
                        panel.messageId = postedMsg.id;
                        panel.channelId = interaction.channelId;
                        await reactRolesSettings.set(guildId, config);

                        await interaction.update({
                            components: [ComponentsV2.successContainer('Panel Published', `The role assignment panel has been published to <#${interaction.channelId}>.`)],
                            embeds: []
                        });
                    } else {
                        await interaction.reply({ content: '❌ Failed to send panel. Make sure I have permission to send messages here.' });
                    }
                }
            }
        }

        // Published Panel Button Interaction Router
        else if (interaction.customId.startsWith('rr_btn:')) {
            const [, panelId, optIdxStr] = interaction.customId.split(':');
            const optIdx = parseInt(optIdxStr, 10);
            const panel = config.panels.find(p => p.id === panelId);

            if (!panel) {
                await interaction.reply({ content: '❌ Role panel not found.' });
                return;
            }

            const mapping = panel.mappings[optIdx];
            if (!mapping) return;

            const member = interaction.member;
            if (!member) return;

            try {
                const roles = member.roles as any;
                const hasRole = roles.cache ? roles.cache.has(mapping.roleId) : (Array.isArray(roles) && roles.includes(mapping.roleId));
                if (hasRole) {
                    await (member.roles as any).remove(mapping.roleId);
                    await interaction.reply({
                        components: [ComponentsV2.successContainer('Role Removed', `Successfully removed <@&${mapping.roleId}>.`)],
                        flags: V2 | MessageFlags.Ephemeral,
                    });
                } else {
                    await (member.roles as any).add(mapping.roleId);
                    await interaction.reply({
                        components: [ComponentsV2.successContainer('Role Added', `Successfully added <@&${mapping.roleId}>.`)],
                        flags: V2 | MessageFlags.Ephemeral,
                    });
                }
            } catch (err: any) {
                logger.error('Failed to toggle role:', err);
                await interaction.reply({ content: '❌ Failed to toggle role. Ensure the bot has a higher role position than the role being assigned.' });
            }
        }
    },

    async handleSelectMenu(interaction) {
        const guildId = interaction.guildId!;
        const config = await reactRolesSettings.get(guildId);

        if (interaction.customId.startsWith('rr_wiz:pick_role:')) {
            const panelId = interaction.customId.split(':')[2];
            const roleId = interaction.values[0];
            const modal = new ModalBuilder()
                .setCustomId(`rr_wiz_modal:add_role:${panelId}:${roleId}`)
                .setTitle('Add Self-Assignable Role');
            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('label')
                        .setLabel('Display Label')
                        .setPlaceholder('Ping Notifications')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('emoji')
                        .setLabel('Emoji')
                        .setPlaceholder('📢')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );
            await interaction.showModal(modal);
            return;
        }

        if (interaction.customId.startsWith('rr_wiz:select_mapping:')) {
            const panelId = interaction.customId.split(':')[2];
            const panel = config.panels.find(p => p.id === panelId);
            const idx = parseInt(interaction.values[0], 10);
            if (panel && !isNaN(idx)) {
                await interaction.update({
                    components: [renderMappingDetail(panel, idx)],
                    embeds: []
                });
            }
            return;
        }

        if (interaction.customId === 'rr_wiz:edit_select') {
            const panelId = interaction.values[0];
            const panel = config.panels.find(p => p.id === panelId);
            if (panel) {
                await interaction.update({
                    components: [renderPanelEditor(panel)],
                    embeds: []
                });
            }
        }

        // Published Panel Dropdown Selection Router
        else if (interaction.customId.startsWith('rr_select:')) {
            const panelId = interaction.customId.split(':')[1];
            const panel = config.panels.find(p => p.id === panelId);

            if (!panel) {
                await interaction.reply({ content: '❌ Role panel not found.' });
                return;
            }

            const optIdx = parseInt(interaction.values[0], 10);
            const mapping = panel.mappings[optIdx];
            if (!mapping) return;

            const member = interaction.member;
            if (!member) return;

            try {
                const roles = member.roles as any;
                const hasRole = roles.cache ? roles.cache.has(mapping.roleId) : (Array.isArray(roles) && roles.includes(mapping.roleId));
                if (hasRole) {
                    await (member.roles as any).remove(mapping.roleId);
                    await interaction.reply({
                        components: [ComponentsV2.successContainer('Role Removed', `Successfully removed <@&${mapping.roleId}>.`)],
                        flags: V2 | MessageFlags.Ephemeral,
                    });
                } else {
                    await (member.roles as any).add(mapping.roleId);
                    await interaction.reply({
                        components: [ComponentsV2.successContainer('Role Added', `Successfully added <@&${mapping.roleId}>.`)],
                        flags: V2 | MessageFlags.Ephemeral,
                    });
                }
            } catch (err) {
                logger.error('Failed to toggle role via select:', err);
                await interaction.reply({ content: '❌ Failed to toggle role. Ensure the bot has a higher role position than the role being assigned.' });
            }
        }
    },

    async handleModal(interaction) {
        const guildId = interaction.guildId!;
        const config = await reactRolesSettings.get(guildId);

        if (interaction.customId === 'rr_wiz_modal:create') {
            const title = interaction.fields.getTextInputValue('title').trim();
            const description = interaction.fields.getTextInputValue('description').trim();

            const panelId = Math.random().toString(36).substring(2, 10);
            const newPanel: ReactRolePanel = {
                id: panelId,
                title,
                description,
                style: 'buttons',
                mappings: []
            };

            config.panels.push(newPanel);
            await reactRolesSettings.set(guildId, config);

            await (interaction as any).update({
                components: [renderPanelEditor(newPanel)],
                embeds: [],
                flags: V2
            });
        }
        else if (interaction.customId.startsWith('rr_wiz_modal:add_role:')) {
            const parts = interaction.customId.split(':');
            const panelId = parts[2];
            const roleId = parts[3];
            const label = interaction.fields.getTextInputValue('label').trim();
            const emoji = interaction.fields.getTextInputValue('emoji').trim();

            const panel = config.panels.find(p => p.id === panelId);
            if (panel) {
                panel.mappings.push({ label, roleId, emoji });
                await reactRolesSettings.set(guildId, config);

                await (interaction as any).update({
                    components: [renderPanelEditor(panel)],
                    embeds: [],
                    flags: V2
                });
            }
        }
        else if (interaction.customId.startsWith('rr_wiz_modal:edit_mapping:')) {
            const parts = interaction.customId.split(':');
            const panelId = parts[2];
            const idx = parseInt(parts[3], 10);
            const label = interaction.fields.getTextInputValue('label').trim();
            const emoji = interaction.fields.getTextInputValue('emoji').trim();

            const panel = config.panels.find(p => p.id === panelId);
            if (panel && !isNaN(idx) && idx >= 0 && idx < panel.mappings.length) {
                panel.mappings[idx].label = label;
                panel.mappings[idx].emoji = emoji;
                await reactRolesSettings.set(guildId, config);

                await (interaction as any).update({
                    components: [renderMappingDetail(panel, idx)],
                    embeds: [],
                    flags: V2
                });
            }
        }
        else if (interaction.customId.startsWith('rr_wiz_modal:edit_details:')) {
            const panelId = interaction.customId.split(':')[2];
            const title = interaction.fields.getTextInputValue('title').trim();
            const description = interaction.fields.getTextInputValue('description').trim();

            const panel = config.panels.find(p => p.id === panelId);
            if (panel) {
                panel.title = title;
                panel.description = description;
                await reactRolesSettings.set(guildId, config);

                await (interaction as any).update({
                    components: [renderPanelEditor(panel)],
                    embeds: [],
                    flags: V2
                });
            }
        }
    }
};
