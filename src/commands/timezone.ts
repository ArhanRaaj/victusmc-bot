import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { timezoneService } from '../services/timezoneSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

// Common timezone offsets for quick reference
const COMMON_TZS: Record<string, number> = {
    'UTC': 0, 'GMT': 0, 'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5,
    'MST': -7, 'MDT': -6, 'PST': -8, 'PDT': -7, 'IST': 5.5,
    'CET': 1, 'CEST': 2, 'EET': 2, 'EEST': 3, 'AEST': 10, 'AEDT': 11,
    'JST': 9, 'KST': 9, 'CST_CN': 8, 'BST': 1,
};

function parseTZ(tz: string): number | null {
    const upper = tz.trim().toUpperCase().replace(/\s/g, '_');
    if (COMMON_TZS[upper] !== undefined) return COMMON_TZS[upper];
    const match = upper.match(/^(UTC|GMT)[+-]?(\d+)(?::(\d+))?$/);
    if (match) {
        const hours = parseInt(match[2]);
        const mins = parseInt(match[3] || '0');
        return match[1] === 'UTC' || match[1] === 'GMT' ? hours + mins / 60 : hours + mins / 60;
    }
    const match2 = upper.match(/^[+-]?(\d+)(?::(\d+))?$/);
    if (match2) {
        const hours = parseInt(match2[1]);
        const mins = parseInt(match2[2] || '0');
        return hours + mins / 60;
    }
    return null;
}

function formatTime(offset: number, minutes?: number): string {
    const utc = new Date();
    const local = new Date(utc.getTime() + offset * 3600000 + (minutes || 0) * 60000);
    return local.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export const timezoneCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('timezone')
        .setDescription('Manage your timezone')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Set your timezone')
                .addStringOption(opt => opt.setName('timezone').setDescription('e.g. EST, UTC+5:30, IST, PST, +8').setRequired(true).setMaxLength(50))
        )
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove your timezone')
        )
        .addSubcommand(sub =>
            sub.setName('view').setDescription('View a user\'s time')
                .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('convert').setDescription('Convert time between timezones')
                .addStringOption(opt => opt.setName('time').setDescription('Time in HH:MM format (24h)').setRequired(true))
                .addStringOption(opt => opt.setName('from').setDescription('Source timezone (e.g. EST)').setRequired(true).setMaxLength(20))
                .addStringOption(opt => opt.setName('to').setDescription('Target timezone (e.g. IST)').setRequired(true).setMaxLength(20))
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'set') {
            const tz = interaction.options.getString('timezone', true);
            const offset = parseTZ(tz);
            if (offset === null) {
                const c = ComponentsV2.errorContainer('Invalid Timezone', 'Use format like `EST`, `UTC+5:30`, `PST`, `+8`, or `GMT-3`.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            await timezoneService.set(interaction.guildId!, interaction.user.id, tz);
            const c = ComponentsV2.successContainer('Timezone Set', `Your timezone has been set to **${tz.toUpperCase()}** (UTC${offset >= 0 ? '+' : ''}${offset}).`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            await timezoneService.remove(interaction.guildId!, interaction.user.id);
            const c = ComponentsV2.successContainer('Timezone Removed', 'Your timezone has been removed.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'view') {
            const user = interaction.options.getUser('user') || interaction.user;
            const tz = await timezoneService.getForUser(interaction.guildId!, user.id);
            if (!tz) {
                const c = ComponentsV2.infoContainer('No Timezone', `${user.username} has not set a timezone.`);
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const offset = parseTZ(tz);
            const time = offset !== null ? formatTime(offset) : 'Unknown';
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(
                `## <: <:user:780495126019473419> Timezone for ${user.username}\n**Timezone:** ${tz.toUpperCase()}\n**Local Time:** ${time}`
            ));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'convert') {
            const timeStr = interaction.options.getString('time', true);
            const from = interaction.options.getString('from', true);
            const to = interaction.options.getString('to', true);

            const fromOffset = parseTZ(from);
            const toOffset = parseTZ(to);
            if (fromOffset === null || toOffset === null) {
                const c = ComponentsV2.errorContainer('Invalid Timezone', 'Could not parse one or both timezones.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
            if (!match) {
                const c = ComponentsV2.errorContainer('Invalid Time', 'Use HH:MM format (24-hour, e.g. 14:30).');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const hours = parseInt(match[1]);
            const mins = parseInt(match[2]);
            if (hours > 23 || mins > 59) {
                const c = ComponentsV2.errorContainer('Invalid Time', 'Hours must be 0-23, minutes 0-59.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const totalMinutes = hours * 60 + mins;
            const fromTotalMinutes = fromOffset * 60;
            const toTotalMinutes = toOffset * 60;
            const diffMinutes = toTotalMinutes - fromTotalMinutes;
            const targetMinutes = ((totalMinutes + diffMinutes) % 1440 + 1440) % 1440;
            const targetHours = Math.floor(targetMinutes / 60);
            const targetMins = targetMinutes % 60;
            const result = `${String(targetHours).padStart(2, '0')}:${String(targetMins).padStart(2, '0')}`;
            const period = targetHours >= 12 ? 'PM' : 'AM';
            const hr12 = targetHours % 12 || 12;

            const c = ComponentsV2.successContainer('Time Conversion',
                `${timeStr} **${from.toUpperCase()}** → **${result}** ${to.toUpperCase()}\n(${hr12}:${String(targetMins).padStart(2, '0')} ${period})`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};