import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { birthdayService } from '../services/birthdaySettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const birthdayCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Birthday system')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Set your birthday')
                .addIntegerOption(opt => opt.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
                .addIntegerOption(opt => opt.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
        )
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove your birthday'))
        .addSubcommand(sub => sub.setName('check').setDescription('Check whose birthday it is today'))
        .addSubcommand(sub =>
            sub.setName('setup').setDescription('Set birthday announcement channel and role (Admin)')
                .addChannelOption(opt => opt.setName('channel').setDescription('Announcement channel').setRequired(true))
                .addRoleOption(opt => opt.setName('role').setDescription('Birthday role to assign').setRequired(false))
        )
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable birthday announcements (Admin)')),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'set') {
            const day = interaction.options.getInteger('day', true);
            const month = interaction.options.getInteger('month', true);
            await birthdayService.set(interaction.guildId!, interaction.user.id, day, month);
            const date = new Date(2000, month - 1, day);
            const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            const c = ComponentsV2.successContainer('Birthday Set', `Your birthday is set to **${formatted}**.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            await birthdayService.remove(interaction.guildId!, interaction.user.id);
            const c = ComponentsV2.successContainer('Birthday Removed', 'Your birthday has been removed.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'check') {
            const birthdays = await birthdayService.getTodaysBirthdays(interaction.guildId!);
            if (birthdays.length === 0) {
                const c = ComponentsV2.infoContainer('No Birthdays Today', 'No one has set their birthday for today.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const list = birthdays.map(b => `<@${b.userId}>`).join(', ');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
            c.addTextDisplayComponents(ComponentsV2.text(`## 🎂 Birthdays Today\n\n${list}\n\nHappy birthday! <:Stars:1524363036389937212>`));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'setup') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Admin required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const channel = interaction.options.getChannel('channel', true);
            const role = interaction.options.getRole('role');
            await birthdayService.saveConfig(interaction.guildId!, {
                channelId: channel.id,
                roleId: role?.id || null,
                enabled: true,
            });
            const c = ComponentsV2.successContainer('Birthday Setup',
                `Announcements in <#${channel.id}>${role ? `, assigning <@&${role.id}>` : ''}.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Admin required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            await birthdayService.saveConfig(interaction.guildId!, { channelId: null, roleId: null, enabled: false });
            const c = ComponentsV2.errorContainer('Disabled', 'Birthday announcements disabled.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};