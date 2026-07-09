import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { greetSettings, formatGreetMsg } from '../services/greetSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const greetCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Configure welcome, leave, and DM greeting messages (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('welcome').setDescription('Configure welcome greeting')
                .addStringOption(opt => opt.setName('action').setDescription('Setup, disable, or test').setRequired(true)
                    .addChoices({ name: 'Setup', value: 'setup' }, { name: 'Disable', value: 'disable' }, { name: 'Test', value: 'test' }))
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for welcome messages (required for setup)').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addStringOption(opt => opt.setName('message').setDescription('Welcome message template (required for setup)').setRequired(false).setMaxLength(1000))
        )
        .addSubcommand(sub =>
            sub.setName('leave').setDescription('Configure leave greeting')
                .addStringOption(opt => opt.setName('action').setDescription('Setup, disable, or test').setRequired(true)
                    .addChoices({ name: 'Setup', value: 'setup' }, { name: 'Disable', value: 'disable' }, { name: 'Test', value: 'test' }))
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for leave messages (required for setup)').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addStringOption(opt => opt.setName('message').setDescription('Leave message template (required for setup)').setRequired(false).setMaxLength(1000))
        )
        .addSubcommand(sub =>
            sub.setName('dm').setDescription('Configure DM greeting')
                .addStringOption(opt => opt.setName('action').setDescription('Setup, disable, or test').setRequired(true)
                    .addChoices({ name: 'Setup', value: 'setup' }, { name: 'Disable', value: 'disable' }, { name: 'Test', value: 'test' }))
                .addStringOption(opt => opt.setName('message').setDescription('DM message template (required for setup)').setRequired(false).setMaxLength(1000))
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();
        const action = interaction.options.getString('action', true);
        const config = await greetSettings.get(interaction.guildId!);

        if (sub === 'welcome' || sub === 'leave') {
            const isWelcome = sub === 'welcome';
            const key = isWelcome ? 'welcomeEnabled' : 'leaveEnabled';
            const channelKey = isWelcome ? 'welcomeChannelId' : 'leaveChannelId';
            const msgKey = isWelcome ? 'welcomeMsg' : 'leaveMsg';

            if (action === 'disable') {
                await greetSettings.set(interaction.guildId!, { [key]: false });
                const c = ComponentsV2.successContainer(`${isWelcome ? 'Welcome' : 'Leave'} Disabled`, `${isWelcome ? 'Welcome' : 'Leave'} messages disabled.`);
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            if (action === 'setup') {
                const channel = interaction.options.getChannel('channel');
                const msg = interaction.options.getString('message');
                if (!channel) {
                    const c = ComponentsV2.errorContainer('Missing Channel', 'Please provide a channel for setup.');
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                const updates: any = { [key]: true, [channelKey]: channel.id };
                if (msg) updates[msgKey] = msg;
                await greetSettings.set(interaction.guildId!, updates);
                const c = ComponentsV2.successContainer(`${isWelcome ? 'Welcome' : 'Leave'} Setup Complete`, `${isWelcome ? 'Welcome' : 'Leave'} messages will be sent to <#${channel.id}>.`);
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            if (action === 'test') {
                const enabled = isWelcome ? config.welcomeEnabled : config.leaveEnabled;
                const chId = isWelcome ? config.welcomeChannelId : config.leaveChannelId;
                const msg = isWelcome ? config.welcomeMsg : config.leaveMsg;
                if (!enabled || !chId) {
                    const c = ComponentsV2.warningContainer('Not Configured', `Please setup ${isWelcome ? 'welcome' : 'leave'} messages first.`);
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                const channel = interaction.guild?.channels.cache.get(chId);
                if (!channel) {
                    const c = ComponentsV2.errorContainer('Channel Not Found', 'The configured channel no longer exists.');
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                const content = formatGreetMsg(msg, interaction.member);
                await (channel as any).send({ content });
                const c = ComponentsV2.successContainer('Test Sent', `Test ${isWelcome ? 'welcome' : 'leave'} message sent to <#${chId}>.`);
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
        }

        if (sub === 'dm') {
            if (action === 'disable') {
                await greetSettings.set(interaction.guildId!, { dmEnabled: false });
                const c = ComponentsV2.successContainer('DM Greeting Disabled', 'New members will not receive a DM on join.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            if (action === 'setup') {
                const msg = interaction.options.getString('message');
                if (!msg) {
                    const c = ComponentsV2.errorContainer('Missing Message', 'Please provide a DM message template.');
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                await greetSettings.set(interaction.guildId!, { dmEnabled: true, dmMsg: msg });
                const c = ComponentsV2.successContainer('DM Greeting Set', 'New members will receive the greeting via DM on join.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            if (action === 'test') {
                if (!config.dmEnabled) {
                    const c = ComponentsV2.warningContainer('Not Configured', 'Please setup DM greeting first.');
                    await interaction.editReply({ components: [c], flags: V2 });
                    return;
                }
                const content = formatGreetMsg(config.dmMsg, interaction.member);
                await interaction.user.send(content).catch(() => {
                    const c = ComponentsV2.warningContainer('DM Failed', 'Could not send DM. Make sure your DMs are open.');
                    return interaction.editReply({ components: [c], flags: V2 });
                });
                const c = ComponentsV2.successContainer('Test Sent', 'Test DM greeting sent to your DMs.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
        }
    },
};