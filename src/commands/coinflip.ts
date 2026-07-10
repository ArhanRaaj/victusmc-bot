import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { economy } from '../services/economySettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const coinflipCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin (bet optional)')
        .setDMPermission(false)
        .addStringOption(o =>
            o.setName('choice').setDescription('Heads or Tails')
                .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' })
        )
        .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setMinValue(50).setMaxValue(100000)),

    async execute(interaction) {
        const guildId = interaction.guildId!;
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger('bet');
        const choice = interaction.options.getString('choice');

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const display = result === 'heads' ? 'Heads' : 'Tails';

        if (bet) {
            if (!choice) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Missing Choice', 'You must pick Heads or Tails when betting!');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const balance = await economy.getBalance(guildId, userId);
            if (balance < bet) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Insufficient Cash',
                    `You need **$${bet.toLocaleString()}** but only have **$${balance.toLocaleString()}**.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const deductResult = await economy.removeCash(guildId, userId, bet);
            if (!deductResult.success) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Bet Failed', 'Could not place your bet.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            const won = choice === result;
            if (won) {
                const winnings = Math.floor(bet * 2);
                const newBalance = await economy.addCash(guildId, userId, winnings);
                const c = ComponentsV2.successContainer('<:Gem:1524362979926081546> Coin Flip (Bet)',
                    `The coin landed on **${display}**!\n\n**You won!** <:Stars:1524363036389937212>\n**Payout:** $${winnings.toLocaleString()}\n**New Balance:** $${newBalance.toLocaleString()}`);
                await interaction.reply({ components: [c], flags: V2 });
            } else {
                const c = ComponentsV2.errorContainer('<:Gem:1524362979926081546> Coin Flip (Bet)',
                    `The coin landed on **${display}**!\n\n**You lost!** 💸\n**Lost:** $${bet.toLocaleString()}\n**Balance:** $${deductResult.balance.toLocaleString()}`);
                await interaction.reply({ components: [c], flags: V2 });
            }
        } else {
            const c = ComponentsV2.infoContainer('<:Gem:1524362979926081546> Coin Flip',
                `The coin landed on **${display}**!`);
            await interaction.reply({ components: [c], flags: V2 });
        }
    },
};
