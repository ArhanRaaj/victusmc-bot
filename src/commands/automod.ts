import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
    ChannelType, PermissionFlagsBits, RoleSelectMenuBuilder,
    SlashCommandBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import type { Command } from '../types/index.js';
import { autoModSettings } from '../services/autoModSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

const FEATURE_LABELS: Record<string, string> = {
    links: 'Anti Link',
    bad_words: 'Anti Badword',
    spam: 'Anti Spam',
    caps: 'Anti Capslock',
    duplicate: 'Anti Repeat Character',
    emoji_spam: 'Anti Emoji Spam',
    scam: 'Anti Scam',
    invites: 'Anti Invite',
    mention_spam: 'Anti Mention Spam',
    advertisement: 'Anti Advertisement',
};

export const autoModCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configure auto-moderation features (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('toggle').setDescription('Enable or disable auto-moderation')
                .addStringOption(opt =>
                    opt.setName('feature').setDescription('The feature to toggle').setRequired(true)
                        .addChoices(
                            { name: 'Anti Link', value: 'links' },
                            { name: 'Anti Badword', value: 'bad_words' },
                            { name: 'Anti Spam', value: 'spam' },
                            { name: 'Anti Capslock', value: 'caps' },
                            { name: 'Anti Repeat Character', value: 'duplicate' },
                            { name: 'Anti Emoji Spam', value: 'emoji_spam' },
                            { name: 'Anti Scam', value: 'scam' },
                            { name: 'Anti Invite', value: 'invites' },
                            { name: 'Anti Mention Spam', value: 'mention_spam' },
                            { name: 'Anti Advertisement', value: 'advertisement' },
                        )
                )
                .addStringOption(opt =>
                    opt.setName('state').setDescription('Enable or disable').setRequired(true)
                        .addChoices({ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' })
                )
        )
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Configure the punishment for a feature')
                .addStringOption(opt =>
                    opt.setName('feature').setDescription('The feature').setRequired(true)
                        .addChoices(
                            { name: 'Anti Link', value: 'links' },
                            { name: 'Anti Badword', value: 'bad_words' },
                            { name: 'Anti Spam', value: 'spam' },
                            { name: 'Anti Capslock', value: 'caps' },
                            { name: 'Anti Repeat Character', value: 'duplicate' },
                            { name: 'Anti Emoji Spam', value: 'emoji_spam' },
                            { name: 'Anti Scam', value: 'scam' },
                            { name: 'Anti Invite', value: 'invites' },
                            { name: 'Anti Mention Spam', value: 'mention_spam' },
                            { name: 'Anti Advertisement', value: 'advertisement' },
                        )
                )
                .addStringOption(opt =>
                    opt.setName('punishment').setDescription('Action to take').setRequired(true)
                        .addChoices(
                            { name: 'Delete', value: 'delete' },
                            { name: 'Warn', value: 'warn' },
                            { name: 'Timeout', value: 'timeout' },
                            { name: 'Kick', value: 'kick' },
                            { name: 'Ban', value: 'ban' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('status').setDescription('View auto-moderation configuration')
        )
        .addSubcommand(sub =>
            sub.setName('whitelist').setDescription('Manage whitelisted roles')
                .addStringOption(opt =>
                    opt.setName('action').setDescription('Add or remove').setRequired(true)
                        .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
                )
                .addRoleOption(opt =>
                    opt.setName('role').setDescription('The role').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('blacklist').setDescription('Manage blacklisted words')
                .addStringOption(opt =>
                    opt.setName('action').setDescription('Add, remove, or list').setRequired(true)
                        .addChoices(
                            { name: 'Add', value: 'add' },
                            { name: 'Remove', value: 'remove' },
                            { name: 'List', value: 'list' },
                        )
                )
                .addStringOption(opt =>
                    opt.setName('word').setDescription('The word to add/remove (not needed for list)')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();
        const config = await autoModSettings.get(interaction.guildId!);

        if (sub === 'toggle') {
            const feature = interaction.options.getString('feature', true);
            const state = interaction.options.getString('state', true);
            const updatedRules = (config.rules || []).map((r: any) =>
                r.type === feature ? { ...r, enabled: state === 'enable' } : r
            );
            const updated = await autoModSettings.set(interaction.guildId!, { rules: updatedRules });
            const label = FEATURE_LABELS[feature] || feature;
            const c = ComponentsV2.successContainer(
                `${label} ${state === 'enable' ? 'Enabled' : 'Disabled'}`,
                `${label} has been **${state === 'enable' ? 'enabled' : 'disabled'}**.`
            );
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'set') {
            const feature = interaction.options.getString('feature', true);
            const punishment = interaction.options.getString('punishment', true);
            const updatedRules = (config.rules || []).map((r: any) =>
                r.type === feature ? { ...r, punishment, enabled: true } : r
            );
            await autoModSettings.set(interaction.guildId!, { rules: updatedRules });
            const label = FEATURE_LABELS[feature] || feature;
            const c = ComponentsV2.successContainer(
                'Punishment Set',
                `${label} will now **${punishment}** offenders.`
            );
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'status') {
            await showStatus(interaction, config);
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
            await autoModSettings.set(interaction.guildId!, { whitelistRoleIds: updated });
            const c = ComponentsV2.successContainer(
                'Whitelist Updated',
                `<@&${role.id}> has been **${action === 'add' ? 'added to' : 'removed from'}** the whitelist.`
            );
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'blacklist') {
            const action = interaction.options.getString('action', true);
            const current = config.blacklistWords || [];

            if (action === 'list') {
                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
                c.addTextDisplayComponents(ComponentsV2.text(
                    `# <:Cross:1524363088621469737> Blacklisted Words\n\n` +
                    (current.length > 0 ? current.map((w: string, i: number) => `\`${i + 1}.\` **${w}**`).join('\n') : 'No blacklisted words.')
                ));
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const word = interaction.options.getString('word', true).toLowerCase().trim();
            if (!word) {
                const c = ComponentsV2.errorContainer('Error', 'Please provide a word.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            let updated: string[];
            if (action === 'add') {
                if (current.includes(word)) {
                    const c = ComponentsV2.warningContainer('Already Exists', `"${word}" is already blacklisted.`);
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                updated = [...current, word];
            } else {
                if (!current.includes(word)) {
                    const c = ComponentsV2.warningContainer('Not Found', `"${word}" is not blacklisted.`);
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                updated = current.filter((w: string) => w !== word);
            }
            await autoModSettings.set(interaction.guildId!, { blacklistWords: updated });
            const c = ComponentsV2.successContainer(
                'Blacklist Updated',
                `"${word}" has been **${action === 'add' ? 'added to' : 'removed from'}** the blacklist.`
            );
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('automod:')) return;
        const config = await autoModSettings.get(interaction.guildId!);
        const action = interaction.customId.split(':')[1];

        if (action === 'toggle') {
            const updated = await autoModSettings.set(interaction.guildId!, { enabled: !config.enabled });
            const c = ComponentsV2.successContainer('Auto-Mod Toggled', `Auto-moderation is now **${updated.enabled ? 'enabled' : 'disabled'}**.`);
            await interaction.update({ components: [c] });
        } else if (action === 'log_channel') {
            const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder().setCustomId('automod:set_log').setPlaceholder('Select log channel...').addChannelTypes(ChannelType.GuildText)
            );
            await interaction.reply({ components: [row], flags: V2 });
        }
    },

    async handleSelectMenu(interaction) {
        if (!interaction.customId.startsWith('automod:')) return;
        const action = interaction.customId.split(':')[1];

        if (action === 'set_log') {
            await autoModSettings.set(interaction.guildId!, { logChannelId: interaction.values[0] });
            const c = ComponentsV2.successContainer('Log Channel Set', `<#${interaction.values[0]}> will receive auto-mod logs.`);
            await interaction.update({ components: [c] });
        }
    },
};

async function showStatus(interaction: any, config: any) {
    const c = ComponentsV2.baseContainer(config.enabled ? ComponentsV2.Accents.success : ComponentsV2.Accents.warning);
    const text = `# <:Shield:1524363080570634240> Auto-Moderation\n\n` +
        `› **Status:** ${config.enabled ? '<:Tick:1524363090626482326> Enabled' : '<:Cross:1524363088621469737> Disabled'}\n` +
        `› **Log Channel:** ${config.logChannelId ? `<#${config.logChannelId}>` : 'Not set'}\n` +
        `› **Whitelisted Roles:** ${config.whitelistRoleIds?.length > 0 ? config.whitelistRoleIds.map((id: string) => `<@&${id}>`).join(', ') : 'None'}\n` +
        `› **Blacklisted Words:** ${config.blacklistWords?.length || 0}\n\n` +
        `### Features\n` +
        (config.rules || []).map((r: any) => {
            const label = FEATURE_LABELS[r.type] || r.type;
            return `› ${r.enabled ? '<:Tick:1524363090626482326>' : '<:Cross:1524363088621469737>'} **${label}**${r.enabled ? ` — \`${r.punishment}${r.threshold ? ` (≥${r.threshold})` : ''}\`` : ''}`;
        }).join('\n');

    c.addTextDisplayComponents(ComponentsV2.text(text));
    c.addSeparatorComponents(ComponentsV2.separator());
    c.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('automod:toggle').setLabel(config.enabled ? 'Disable' : 'Enable').setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder().setCustomId('automod:log_channel').setLabel('Set Log Channel').setStyle(ButtonStyle.Secondary),
        )
    );
    await interaction.editReply({ components: [c], flags: V2 });
}