import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { economy } from '../services/economySettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const payCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Send coins to another user')
        .setDMPermission(false)
        .addUserOption(opt => opt.setName('user').setDescription('Recipient').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of coins').setRequired(true).setMinValue(1).setMaxValue(10_000_000)),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        if (target.id === interaction.user.id) {
            const c = ComponentsV2.errorContainer('Cannot Pay Yourself', 'You cannot send coins to yourself.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        const { success } = await economy.removeCash(interaction.guildId!, interaction.user.id, amount);
        if (!success) {
            const bal = await economy.getBalance(interaction.guildId!, interaction.user.id);
            const c = ComponentsV2.errorContainer('Insufficient Funds', `You have **${bal.toLocaleString()}** coins but need **${amount.toLocaleString()}**.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        await economy.addCash(interaction.guildId!, target.id, amount);
        const c = ComponentsV2.successContainer('Payment Sent',
            `Sent **${amount.toLocaleString()}** coins to ${target.tag}.`);
        await interaction.editReply({ components: [c], flags: V2 });
    },
};