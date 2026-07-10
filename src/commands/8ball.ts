import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { economy } from '../services/economySettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

const responses: Array<{ text: string; type: 'positive' | 'negative' | 'neutral' }> = [
    { text: 'It is certain.', type: 'positive' },
    { text: 'It is decidedly so.', type: 'positive' },
    { text: 'Without a doubt.', type: 'positive' },
    { text: 'Yes definitely.', type: 'positive' },
    { text: 'You may rely on it.', type: 'positive' },
    { text: 'As I see it, yes.', type: 'positive' },
    { text: 'Most likely.', type: 'positive' },
    { text: 'Outlook good.', type: 'positive' },
    { text: 'Yes.', type: 'positive' },
    { text: 'Signs point to yes.', type: 'positive' },
    { text: 'Reply hazy, try again.', type: 'neutral' },
    { text: 'Ask again later.', type: 'neutral' },
    { text: 'Better not tell you now.', type: 'neutral' },
    { text: 'Cannot predict now.', type: 'neutral' },
    { text: 'Concentrate and ask again.', type: 'neutral' },
    { text: "Don't count on it.", type: 'negative' },
    { text: 'My reply is no.', type: 'negative' },
    { text: 'My sources say no.', type: 'negative' },
    { text: 'Outlook not so good.', type: 'negative' },
    { text: 'Very doubtful.', type: 'negative' },
];

function randomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export const eightballCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question (bet optional)')
        .setDMPermission(false)
        .addStringOption(o => o.setName('question').setDescription('Yes/no question').setRequired(true).setMaxLength(500))
        .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet (positive answers win)').setMinValue(50).setMaxValue(100000)),

    async execute(interaction) {
        const question = interaction.options.getString('question', true);
        const bet = interaction.options.getInteger('bet');

        if (bet) {
            const guildId = interaction.guildId!;
            const userId = interaction.user.id;
            const balance = await economy.getBalance(guildId, userId);
            if (balance < bet) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Insufficient Cash',
                    `You need **$${bet.toLocaleString()}** but only have **$${balance.toLocaleString()}**.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
            const result = await economy.removeCash(guildId, userId, bet);
            if (!result.success) {
                const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Bet Failed', 'Could not place your bet.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            const picked = randomItem(responses);
            let outcomeText: string;
            if (picked.type === 'positive') {
                const winnings = Math.floor(bet * 2);
                const newBalance = await economy.addCash(guildId, userId, winnings);
                outcomeText = `**You won!** <:Stars:1524363036389937212>\n**Payout:** $${winnings.toLocaleString()}\n**New Balance:** $${newBalance.toLocaleString()}`;
            } else if (picked.type === 'negative') {
                outcomeText = `**You lost!** 💸\n**Lost:** $${bet.toLocaleString()}\n**Balance:** $${result.balance.toLocaleString()}`;
            } else {
                const newBalance = await economy.addCash(guildId, userId, bet);
                outcomeText = `**Push (refund)** <:Retry:1524363041024512010>\n**Balance:** $${newBalance.toLocaleString()}`;
            }
            const c = ComponentsV2.infoContainer('🎱 Magic 8-Ball (Bet)',
                `**Question:** ${question}\n\n**Answer:** *${picked.text}*\n\n${outcomeText}`);
            await interaction.reply({ components: [c], flags: V2 });
        } else {
            const picked = randomItem(responses);
            const c = ComponentsV2.infoContainer('🎱 Magic 8-Ball',
                `**Question:** ${question}\n\n**Answer:** *${picked.text}*`);
            await interaction.reply({ components: [c], flags: V2 });
        }
    },
};
