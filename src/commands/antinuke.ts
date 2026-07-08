import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
    ChannelType, PermissionFlagsBits, RoleSelectMenuBuilder,
    SlashCommandBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import type { Command } from '../types/index.js';
import { antiNukeSettings } from '../services/antiNukeSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
function renderDashboard(config: any): any {
    const c = ComponentsV2.baseContainer(config.enabled ? ComponentsV2.Accents.success : ComponentsV2.Accents.warning);
    let text = `# Anti-Nuke Protection\n\n` +
        `› **Status:** ${config.enabled ? 'Enabled' : 'Disabled'}\n` +
        `› **Log Channel:** ${config.logChannelId ? `<#${config.logChannelId}>` : 'Not set'}\n` +
        `› **Whitelisted Roles:** ${config.whitelistRoleIds?.length ? config.whitelistRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}\n` +
        `› **Trusted Roles:** ${config.trustedRoleIds?.length ? config.trustedRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}\n\n` +
        `### Punishment Thresholds\n` +
        Object.entries(config.punishments || {}).map(([key, val]: [string, any]) => {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
            return `› **${label}:** ${val.enabled ? `\`${val.threshold || '-'} triggers → ${val.action}\`` : 'Disabled'}`;
        }).join('\n');

    c.addTextDisplayComponents(ComponentsV2.text(text))
        .addSeparatorComponents(ComponentsV2.separator())
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('antinuke:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId('antinuke:log_channel').setLabel('Set Log Channel').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('antinuke:whitelist').setLabel('Whitelist Roles').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('antinuke:trusted').setLabel('Trusted Roles').setStyle(ButtonStyle.Secondary),
            )
        );
    return c;
}

export const antiNukeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Configure anti-nuke server protection (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const config = await antiNukeSettings.get(interaction.guildId!);
        await interaction.editReply({ components: [renderDashboard(config)], flags: V2 });
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('antinuke:')) return;
        const config = await antiNukeSettings.get(interaction.guildId!);
        const action = interaction.customId.split(':')[1];

        if (action === 'toggle') {
            const updated = await antiNukeSettings.set(interaction.guildId!, { enabled: !config.enabled });
            await interaction.update({ components: [renderDashboard(updated)] });
        } else if (action === 'log_channel') {
            const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('antinuke:set_log')
                    .setPlaceholder('Select log channel...')
                    .addChannelTypes(ChannelType.GuildText)
            );
            await interaction.reply({ components: [row], flags: V2 });
        } else if (action === 'whitelist') {
            const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('antinuke:set_whitelist')
                    .setPlaceholder('Select whitelisted roles...')
                    .setMinValues(0).setMaxValues(25)
            );
            await interaction.reply({ components: [row], flags: V2 });
        } else if (action === 'trusted') {
            const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('antinuke:set_trusted')
                    .setPlaceholder('Select trusted roles...')
                    .setMinValues(0).setMaxValues(25)
            );
            await interaction.reply({ components: [row], flags: V2 });
        }
    },

    async handleSelectMenu(interaction) {
        if (!interaction.customId.startsWith('antinuke:')) return;
        const action = interaction.customId.split(':')[1];
        const config = await antiNukeSettings.get(interaction.guildId!);

        if (action === 'set_log') {
            const updated = await antiNukeSettings.set(interaction.guildId!, { logChannelId: interaction.values[0] });
            await interaction.update({ components: [renderDashboard(updated)] });
        } else if (action === 'set_whitelist') {
            const updated = await antiNukeSettings.set(interaction.guildId!, { whitelistRoleIds: interaction.values });
            await interaction.update({ components: [renderDashboard(updated)] });
        } else if (action === 'set_trusted') {
            const updated = await antiNukeSettings.set(interaction.guildId!, { trustedRoleIds: interaction.values });
            await interaction.update({ components: [renderDashboard(updated)] });
        }
    },
};
