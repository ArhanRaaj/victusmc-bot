import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { isStaffMember, markAttendance, getAttendanceLog, getAttendanceLogByUser, getAttendanceConfig, updateAttendanceConfig } from '../services/staffSettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const attendanceCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('attendance')
        .setDescription('Attendance system commands')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('mark')
                .setDescription('Mark your daily attendance (staff only)'))
        .addSubcommandGroup(group =>
            group.setName('config')
                .setDescription('Configure attendance settings')
                .addSubcommand(sub =>
                    sub.setName('channel')
                        .setDescription('Set the log channel for attendance records')
                        .addChannelOption(o =>
                            o.setName('channel')
                                .setDescription('The channel to send attendance logs')
                                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                                .setRequired(true)))
                .addSubcommand(sub =>
                    sub.setName('toggle')
                        .setDescription('Enable or disable the attendance system'))
                .addSubcommand(sub =>
                    sub.setName('status')
                        .setDescription('View current attendance configuration'))),

    async execute(interaction) {
        const guildId = interaction.guildId!;
        const sub = interaction.options.getSubcommand(true);
        const group = interaction.options.getSubcommandGroup(false);

        if (group === 'config') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> No Permission', 'You need `Manage Channels` permission to configure attendance.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            if (sub === 'channel') {
                const channel = interaction.options.getChannel('channel', true);
                updateAttendanceConfig(guildId, { logChannelId: channel.id });
                const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Log Channel Set', `Attendance logs will be sent to ${channel}.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            if (sub === 'toggle') {
                const config = getAttendanceConfig(guildId);
                const newState = !config.enabled;
                updateAttendanceConfig(guildId, { enabled: newState });
                const c = newState
                    ? ComponentsV2.successContainer('<:Tick:1524363090626482326> Attendance Enabled', 'Staff can now mark their daily attendance.')
                    : ComponentsV2.warningContainer('<:Dissable:1524363096855023626> Attendance Disabled', 'Attendance marking has been turned off.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            if (sub === 'status') {
                const config = getAttendanceConfig(guildId);
                const statusEmoji = config.enabled ? '<:Tick:1524363090626482326>' : '<:Cross:1524363088621469737>';
                const statusText = config.enabled ? 'Enabled' : 'Disabled';
                const channelText = config.logChannelId ? `<#${config.logChannelId}>` : 'Not set';
                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
                c.addTextDisplayComponents(ComponentsV2.text(
                    `# <:Calender:1524362997856997397> Attendance Configuration\n\n` +
                    `${statusEmoji} **Status:** ${statusText}\n` +
                    `<:Message:1524363100734623836> **Log Channel:** ${channelText}`
                ));
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
        }

        if (sub === 'mark') {
            const config = getAttendanceConfig(guildId);
            if (!config.enabled) {
                const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> Attendance Disabled', 'The attendance system is not enabled in this server.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            if (!isStaffMember(guildId, interaction.user.id)) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Access Denied', 'Only staff members can mark attendance.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const marked = markAttendance(guildId, interaction.user.id);
            if (!marked) {
                const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> Already Marked', 'You have already marked your attendance today.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Attendance Marked', 'Your daily attendance has been recorded.');
            await interaction.reply({ components: [c], flags: V2 });

            if (config.logChannelId) {
                const logChannel = interaction.guild?.channels.cache.get(config.logChannelId);
                if (logChannel && 'send' in logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0x6366f1)
                        .setTitle('Attendance Marked')
                        .setDescription(`${interaction.user} marked their daily attendance.`)
                        .addFields({ name: 'Staff Member', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true })
                        .addFields({ name: 'Date', value: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), inline: true })
                        .addFields({ name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true })
                        .setFooter({ text: 'VictusMC Attendance System' })
                        .setTimestamp();
                    await logChannel.send({ embeds: [embed] });
                }
            }
        }
    },
};

export const attendanceLogCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('attendance-log')
        .setDescription('View attendance logs')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .setDMPermission(false)
        .addStringOption(o =>
            o.setName('date')
                .setDescription('Date to view (YYYY-MM-DD, defaults to today)')
                .setRequired(false)),

    async execute(interaction) {
        const guildId = interaction.guildId!;
        const dateInput = interaction.options.getString('date');
        const date = dateInput || new Date().toISOString().slice(0, 10);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Invalid Date', 'Please use YYYY-MM-DD format (e.g. 2026-07-08).');
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        const records = getAttendanceLog(guildId, date);
        if (records.length === 0) {
            const c = ComponentsV2.infoContainer('<:Info:1524363004823470120> No Records', `No attendance records found for **${date}**.`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        const list = records.map(r => `<@${r.userId}> — <t:${Math.floor(new Date(r.timestamp).getTime() / 1000)}:T>`).join('\n');
        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(`# <:Calender:1524362997856997397> Attendance Log — ${date}\n\n${list}`));
        await interaction.reply({ components: [c], flags: V2 });
    },
};
