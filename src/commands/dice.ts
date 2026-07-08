import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { economy } from '../services/economySettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const diceCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Roll a dice (bet on a number)')
        .setDMPermission(false)
        .addIntegerOption(o => o.setName('sides').setDescription('Number of sides').setMinValue(2).setMaxValue(100))
        .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setMinValue(50).setMaxValue(100000))
        .addIntegerOption(o => o.setName('number').setDescription('Number to bet on (1-6, or 1-sides). Winning multiplies bet by (sides-1)').setMinValue(1).setMaxValue(100)),

    async execute(interaction) {
        const guildId = interaction.guildId!;
        const userId = interaction.user.id;
        const sides = interaction.options.getInteger('sides') || 6;
        const bet = interaction.options.getInteger('bet');
        const chosenNumber = interaction.options.getInteger('number');

        const result = randomInt(1, sides);

        if (bet) {
            if (!chosenNumber || chosenNumber > sides) {
                const c = ComponentsV2.errorContainer('❌ Missing Number',
                    `You must pick a number (1-${sides}) to bet on!`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const balance = await economy.getBalance(guildId, userId);
            if (balance < bet) {
                const c = ComponentsV2.errorContainer('❌ Insufficient Cash',
                    `You need **$${bet.toLocaleString()}** but only have **$${balance.toLocaleString()}**.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const deductResult = await economy.removeCash(guildId, userId, bet);
            if (!deductResult.success) {
                const c = ComponentsV2.errorContainer('❌ Bet Failed', 'Could not place your bet.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            const won = chosenNumber === result;
            if (won) {
                const multiplier = sides - 1;
                const winnings = Math.floor(bet * multiplier);
                const newBalance = await economy.addCash(guildId, userId, winnings);
                const c = ComponentsV2.successContainer('🎲 Dice Roll (Bet)',
                    `Rolled a **d${sides}**: **\`${result}\`**\n\n**You won!** 🎉\n**Payout:** $${winnings.toLocaleString()} (×${multiplier})\n**New Balance:** $${newBalance.toLocaleString()}`);
                await interaction.reply({ components: [c], flags: V2 });
            } else {
                const c = ComponentsV2.errorContainer('🎲 Dice Roll (Bet)',
                    `Rolled a **d${sides}**: **\`${result}\`**\n\n**You lost!** 💸\n**Lost:** $${bet.toLocaleString()}\n**Balance:** $${deductResult.balance.toLocaleString()}`);
                await interaction.reply({ components: [c], flags: V2 });
            }
        } else {
            const c = ComponentsV2.infoContainer('🎲 Dice Roll',
                `Rolled a **d${sides}**\n\n**Result: \`${result}\`**`);
            await interaction.reply({ components: [c], flags: V2 });
        }
    },
};
