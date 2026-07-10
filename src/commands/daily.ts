import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { economy } from '../services/economySettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
const DAILY_AMOUNT = 500;

export const dailyCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily cash reward')
        .setDMPermission(false),

    async execute(interaction) {
        const guildId = interaction.guildId!;
        const userId = interaction.user.id;

        const entry = await economy.getEntry(guildId, userId);

        if (!economy.canClaimDaily(entry)) {
            const last = new Date(entry.dailyLastClaimed!);
            const nextClaim = new Date(last.getTime() + 86400000);
            const c = ComponentsV2.warningContainer('<:Processing:1524363038713708544> Daily Already Claimed',
                `You already claimed your daily today.\n\n**Next claim:** <t:${Math.floor(nextClaim.getTime() / 1000)}:R>`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        const newBalance = await economy.addCash(guildId, userId, DAILY_AMOUNT);
        await economy.setDailyClaimed(guildId, userId);

        const c = ComponentsV2.successContainer('<:Diamond:1524363027711918110> Daily Reward Claimed!',
            `You received **$${DAILY_AMOUNT.toLocaleString()}**!\n\n**New Balance:** $${newBalance.toLocaleString()}\n\nCome back tomorrow for another reward.`);
        await interaction.reply({ components: [c], flags: V2 });
    },
};
