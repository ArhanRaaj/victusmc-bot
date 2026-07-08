import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
    ChannelType, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import type { Command } from '../types/index.js';
import { autoModSettings } from '../services/autoModSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
const RULE_LABELS: Record<string, string> = {
    spam: 'Spam Detection', invites: 'Invite Links', links: 'All Links',
    scam: 'Scam Links', mention_spam: 'Mention Spam', emoji_spam: 'Emoji Spam',
    caps: 'Excessive Caps', bad_words: 'Bad Words', duplicate: 'Duplicate Messages',
    advertisement: 'Advertisement',
};

function renderDashboard(config: any): any {
    const c = ComponentsV2.baseContainer(config.enabled ? ComponentsV2.Accents.success : ComponentsV2.Accents.warning);
    let text = `# Auto-Moderation\n\n` +
        `› **Status:** ${config.enabled ? 'Enabled' : 'Disabled'}\n` +
        `› **Log Channel:** ${config.logChannelId ? `<#${config.logChannelId}>` : 'Not set'}\n\n` +
        `### Rules\n` +
        (config.rules || []).map((r: any) =>
            `› **${RULE_LABELS[r.type] || r.type}:** ${r.enabled ? `\`${r.punishment}${r.threshold ? ` (≥${r.threshold})` : ''}\`` : 'Disabled'}`
        ).join('\n');

    c.addTextDisplayComponents(ComponentsV2.text(text))
        .addSeparatorComponents(ComponentsV2.separator())
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('automod:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder().setCustomId('automod:log_channel').setLabel('Set Log Channel').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('automod:toggle_rules').setLabel('Toggle Rules').setStyle(ButtonStyle.Secondary),
            )
        );
    return c;
}

export const autoModCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure auto-moderation rules (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const config = await autoModSettings.get(interaction.guildId!);
        await interaction.editReply({ components: [renderDashboard(config)], flags: V2 });
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('automod:')) return;
        const config = await autoModSettings.get(interaction.guildId!);
        const action = interaction.customId.split(':')[1];

        if (action === 'toggle') {
            const updated = await autoModSettings.set(interaction.guildId!, { enabled: !config.enabled });
            await interaction.update({ components: [renderDashboard(updated)] });
        } else if (action === 'log_channel') {
            const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('automod:set_log')
                    .setPlaceholder('Select log channel...')
                    .addChannelTypes(ChannelType.GuildText)
            );
            await interaction.reply({ components: [row], flags: V2 });
        } else if (action === 'toggle_rules') {
            const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('automod:rule_toggle')
                    .setPlaceholder('Toggle individual rules...')
                    .setMinValues(0).setMaxValues(config.rules.length)
                    .addOptions(config.rules.map((r: any) => ({
                        label: RULE_LABELS[r.type] || r.type,
                        value: r.id,
                        description: r.enabled ? 'Currently enabled' : 'Currently disabled',
                        default: r.enabled,
                    })))
            );
            await interaction.reply({ components: [menu], flags: V2 });
        }
    },

    async handleSelectMenu(interaction) {
        if (!interaction.customId.startsWith('automod:')) return;
        const action = interaction.customId.split(':')[1];
        const config = await autoModSettings.get(interaction.guildId!);

        if (action === 'set_log') {
            const updated = await autoModSettings.set(interaction.guildId!, { logChannelId: interaction.values[0] });
            await interaction.update({ components: [renderDashboard(updated)] });
        } else if (action === 'rule_toggle') {
            const enabledIds = interaction.values;
            const updatedRules = (config.rules || []).map((r: any) => ({
                ...r,
                enabled: enabledIds.includes(r.id),
            }));
            const updated = await autoModSettings.set(interaction.guildId!, { rules: updatedRules });
            await interaction.update({ components: [renderDashboard(updated)] });
        }
    },
};
