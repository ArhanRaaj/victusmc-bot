import { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelSelectMenuBuilder, 
    ChannelType, 
    PermissionFlagsBits, 
    SlashCommandBuilder, 
    StringSelectMenuBuilder, 
    TextChannel 
} from 'discord.js';
import type { Command } from '../types/index.js';
import { auditLogSettings, AuditLogConfig } from '../services/auditLogSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
const EVENTS_OPTIONS = [
    { label: 'Message Edits', value: 'message_edit', description: 'Log when messages are edited' },
    { label: 'Message Deletions', value: 'message_delete', description: 'Log when messages are deleted' },
    { label: 'Member Joins', value: 'member_join', description: 'Log when new members join the server' },
    { label: 'Member Leaves', value: 'member_leave', description: 'Log when members leave the server' },
    { label: 'Server Bans', value: 'ban', description: 'Log when members are banned' },
    { label: 'Server Unbans', value: 'unban', description: 'Log when member bans are removed' },
    { label: 'Voice Join', value: 'voice_join', description: 'Log when members join voice channels' },
    { label: 'Voice Leave', value: 'voice_leave', description: 'Log when members leave voice channels' },
    { label: 'Voice Move', value: 'voice_move', description: 'Log when members move between voice channels' },
];

function renderDashboard(config: AuditLogConfig): any {
    const c = ComponentsV2.baseContainer(config.enabled ? ComponentsV2.Accents.success : ComponentsV2.Accents.warning);

    const eventLines = EVENTS_OPTIONS.map(opt => {
        const enabled = config.events.includes(opt.value);
        const ch = config.channels?.[opt.value];
        return `${enabled ? '🟢' : '🔴'} **${opt.label}** → ${ch ? `<#${ch}>` : '*Not set*'}`;
    }).join('\n');

    const text = `# 📜 Server Audit Log System\n` +
        `Configure individual channels for each log type.\n\n` +
        `› **Status:** ${config.enabled ? '🟢 **Enabled**' : '🔴 **Disabled**'}\n\n` +
        `### Event Channels\n${eventLines}`;

    c.addTextDisplayComponents(ComponentsV2.text(text))
     .addSeparatorComponents(ComponentsV2.separator());

    const eventSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('audit_log:select_event')
            .setPlaceholder('Select event to configure channel...')
            .addOptions(EVENTS_OPTIONS.map(opt => ({
                label: opt.label,
                value: opt.value,
                description: config.channels?.[opt.value] ? `Channel set` : 'No channel set',
            })))
    );

    const toggleRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('audit_log:toggle')
            .setLabel(config.enabled ? 'Disable Audit Logs' : 'Enable Audit Logs')
            .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('audit_log:reset')
            .setLabel('Reset All Channels')
            .setStyle(ButtonStyle.Secondary)
    );

    c.addActionRowComponents(eventSelect);
    c.addActionRowComponents(toggleRow);

    return c;
}

export const auditLogCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('audit-log')
        .setDescription('Configure server audit logging options')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Open the audit log configuration dashboard')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand(true);
        if (sub === 'setup') {
            const config = await auditLogSettings.get(interaction.guildId!);
            await interaction.reply({
                components: [renderDashboard(config)],
                flags: V2
            });
        }
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('audit_log:')) return;
        const action = interaction.customId.split(':')[1];

        if (action === 'toggle') {
            const config = await auditLogSettings.get(interaction.guildId!);
            const updated = await auditLogSettings.set(interaction.guildId!, { enabled: !config.enabled });
            await interaction.update({ components: [renderDashboard(updated)], embeds: [] });
        } else if (action === 'reset') {
            const updated = await auditLogSettings.set(interaction.guildId!, { channels: {} });
            await interaction.update({ components: [renderDashboard(updated)], embeds: [] });
        }
    },

    async handleSelectMenu(interaction) {
        if (!interaction.customId.startsWith('audit_log:')) return;
        const parts = interaction.customId.split(':');
        const action = parts[1];
        const eventType = parts[2];
        const config = await auditLogSettings.get(interaction.guildId!);

        if (action === 'select_event') {
            const selectedEvent = interaction.values[0];
            const label = EVENTS_OPTIONS.find(o => o.value === selectedEvent)?.label || selectedEvent;
            const channelRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`audit_log:set_channel:${selectedEvent}`)
                    .setPlaceholder(`Select channel for ${label}...`)
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            );
            const dashboard = renderDashboard(config);
            const info = ComponentsV2.infoContainer('Event Selected', `Now choose a channel for **${label}** using the selector below.`);
            await interaction.update({ components: [dashboard, info, channelRow], embeds: [] });
        } else if (action === 'set_channel' && eventType) {
            const chId = interaction.values[0];
            const channels = { ...config.channels, [eventType]: chId };
            const updated = await auditLogSettings.set(interaction.guildId!, { channels });
            await interaction.update({ components: [renderDashboard(updated)], embeds: [] });
        }
    }
};
