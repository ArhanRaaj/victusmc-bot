import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { reminderService } from '../services/reminderSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

function parseDuration(input: string): number | null {
    const match = input.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return num * (multipliers[unit] || 0);
}

export const remindCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('me').setDescription('Set a reminder (DM)')
                .addStringOption(opt => opt.setName('time').setDescription('e.g. 30m, 2h, 1d').setRequired(true))
                .addStringOption(opt => opt.setName('message').setDescription('What to remind you about').setRequired(true).setMaxLength(500))
        )
        .addSubcommand(sub =>
            sub.setName('here').setDescription('Set a reminder (in this channel)')
                .addStringOption(opt => opt.setName('time').setDescription('e.g. 30m, 2h, 1d').setRequired(true))
                .addStringOption(opt => opt.setName('message').setDescription('What to remind about').setRequired(true).setMaxLength(500))
        )
        .addSubcommand(sub =>
            sub.setName('list').setDescription('List your reminders')
        )
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove a reminder')
                .addIntegerOption(opt => opt.setName('id').setDescription('ID from list').setRequired(true).setMinValue(1))
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'me' || sub === 'here') {
            const timeStr = interaction.options.getString('time', true);
            const msg = interaction.options.getString('message', true);
            const duration = parseDuration(timeStr);
            if (!duration || duration < 10000) {
                const c = ComponentsV2.errorContainer('Invalid Time', 'Use format like `30m`, `2h`, `1d`. Minimum 10 seconds.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const reminders = await reminderService.get(interaction.guildId!);
            const userReminders = reminders.filter(r => r.userId === interaction.user.id);
            if (userReminders.length >= 10) {
                const c = ComponentsV2.errorContainer('Too Many', 'Maximum 10 reminders per user.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            await reminderService.add(interaction.guildId!, {
                userId: interaction.user.id,
                channelId: sub === 'here' ? interaction.channelId : null,
                message: msg,
                endTime: Date.now() + duration,
                reminded: false,
            });

            const c = ComponentsV2.successContainer('Reminder Set',
                `I'll remind you${sub === 'here' ? '' : ' in DMs'} in **${timeStr}** about: ${msg.substring(0, 100)}`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'list') {
            const reminders = await reminderService.get(interaction.guildId!);
            const userReminders = reminders.filter(r => r.userId === interaction.user.id && !r.reminded);
            if (userReminders.length === 0) {
                const c = ComponentsV2.infoContainer('No Reminders', 'You have no pending reminders.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const list = userReminders.map((r, i) =>
                `**${i + 1}.** <t:${Math.floor(r.endTime / 1000)}:R> — ${r.message.substring(0, 80)}`
            ).join('\n');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Edit:1524363079675154433> Your Reminders\n\n${list}`));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            const id = interaction.options.getInteger('id', true) - 1;
            const reminders = await reminderService.get(interaction.guildId!);
            const userIndices = reminders
                .map((r, i) => ({ ...r, originalIndex: i }))
                .filter(r => r.userId === interaction.user.id && !r.reminded);
            if (id < 0 || id >= userIndices.length) {
                const c = ComponentsV2.errorContainer('Invalid ID', 'No reminder with that ID.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const removed = await reminderService.remove(interaction.guildId!, userIndices[id].originalIndex);
            const c = ComponentsV2.successContainer('Removed', 'Reminder removed.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};