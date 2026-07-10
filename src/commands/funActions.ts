import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';

const ACTION_NAMES = ['hug', 'kiss', 'slap', 'pat', 'cuddle', 'poke', 'dance', 'blush', 'cry', 'kill', 'bite', 'smug', 'baka', 'happy', 'wave', 'wink', 'laugh', 'sleep', 'smile', 'highfive', 'lick', 'yeet', 'punch'] as const;

const GIFS: Record<string, string[]> = {
    hug: ['https://media.tenor.com/4WgsRYI7JL4AAAAd/anime-hug.gif', 'https://media.tenor.com/6w9Ew2ANn4QAAAAd/anime-hug.gif', 'https://media.tenor.com/2OLFjHXs4scAAAAd/hug-anime.gif'],
    kiss: ['https://media.tenor.com/CwA4Uo5k-9IAAAAd/kiss-anime.gif', 'https://media.tenor.com/gU2J6M5b3RkAAAAd/anime-kiss.gif', 'https://media.tenor.com/0YqiBFHFOYAAAAAd/anime-kiss.gif'],
    slap: ['https://media.tenor.com/X7WmPJzGP0cAAAAd/anime-slap.gif', 'https://media.tenor.com/nM6-GX-lz84AAAAd/anime-slap.gif', 'https://media.tenor.com/gI3QjUJm0TsAAAAd/anime-slap.gif'],
    pat: ['https://media.tenor.com/3aM5L3JMsG0AAAAd/anime-pat.gif', 'https://media.tenor.com/YJTTwV0ricAAAAAd/anime-pat.gif', 'https://media.tenor.com/HJHKR1xQ4DYAAAAd/anime-pat.gif'],
    cuddle: ['https://media.tenor.com/3QxS0M0VGgsAAAAd/anime-cuddle.gif', 'https://media.tenor.com/8qGm8Ghl-5QAAAAd/anime-cuddle.gif'],
    poke: ['https://media.tenor.com/H6c6s-41X6sAAAAd/anime-poke.gif', 'https://media.tenor.com/3nA7Gx2H6U0AAAAd/anime-poke.gif'],
    dance: ['https://media.tenor.com/6J2QAq0T6zsAAAAd/anime-dance.gif', 'https://media.tenor.com/mFLbUxFVfWQAAAAd/anime-dance.gif'],
    blush: ['https://media.tenor.com/6sJb6Jb6JbAAAAAd/anime-blush.gif', 'https://media.tenor.com/NkJPzM6C0tAAAAAd/anime-blush.gif'],
    cry: ['https://media.tenor.com/YN8P-Y8P-Y8AAAAd/anime-cry.gif', 'https://media.tenor.com/3O8O8O8O8O8AAAAd/anime-cry.gif'],
    kill: ['https://media.tenor.com/5N8N5N8N5N8AAAAd/anime-kill.gif', 'https://media.tenor.com/8O8O8O8O8O8AAAAd/anime-kill.gif'],
    bite: ['https://media.tenor.com/4N8N4N8N4N8AAAAd/anime-bite.gif', 'https://media.tenor.com/2O8O2O8O2O8AAAAd/anime-bite.gif'],
    smug: ['https://media.tenor.com/6J8JA6J8JA6AAAAd/anime-smug.gif', 'https://media.tenor.com/Nk8Nk8Nk8NkAAAAd/anime-smug.gif'],
    baka: ['https://media.tenor.com/4Wf8Wf8Wf8WAAAAd/anime-baka.gif', 'https://media.tenor.com/6J8JA6J8JA6AAAAd/anime-baka.gif'],
    happy: ['https://media.tenor.com/8O8O8O8O8O8AAAAd/anime-happy.gif', 'https://media.tenor.com/Y8Y8Y8Y8Y8YAAAAd/anime-happy.gif'],
    wave: ['https://media.tenor.com/2O8O2O8O2O8AAAAd/anime-wave.gif', 'https://media.tenor.com/4N8N4N8N4N8AAAAd/anime-wave.gif'],
    wink: ['https://media.tenor.com/6J8JA6J8JA6AAAAd/anime-wink.gif', 'https://media.tenor.com/Nk8Nk8Nk8NkAAAAd/anime-wink.gif'],
    laugh: ['https://media.tenor.com/YNqP-Y8L-Y8AAAAd/anime-laugh.gif', 'https://media.tenor.com/8O8O8O8O8O8AAAAd/anime-laugh.gif'],
    sleep: ['https://media.tenor.com/4W8W4W8W4W8AAAAd/anime-sleep.gif', 'https://media.tenor.com/6J8JA6J8JA6AAAAd/anime-sleep.gif'],
    smile: ['https://media.tenor.com/8O8O8O8O8O8AAAAd/anime-smile.gif', 'https://media.tenor.com/Y8Y8Y8Y8Y8YAAAAd/anime-smile.gif'],
    highfive: ['https://media.tenor.com/2O8O2O8O2O8AAAAd/anime-highfive.gif', 'https://media.tenor.com/4N8N4N8N4N8AAAAd/anime-highfive.gif'],
    lick: ['https://media.tenor.com/6J8JA6J8JA6AAAAd/anime-lick.gif', 'https://media.tenor.com/Nk8Nk8Nk8NkAAAAd/anime-lick.gif'],
    yeet: ['https://media.tenor.com/YNqP-Y8L-Y8AAAAd/anime-yeet.gif', 'https://media.tenor.com/8O8O8O8O8O8AAAAd/anime-yeet.gif'],
    punch: ['https://media.tenor.com/4W8W4W8W4W8AAAAd/anime-punch.gif', 'https://media.tenor.com/6J8JA6J8JA6AAAAd/anime-punch.gif'],
};

function getGif(action: string): string {
    const urls = GIFS[action];
    if (!urls || urls.length === 0) return 'https://media.tenor.com/6J8JA6J8JA6AAAAd/anime-dance.gif';
    return urls[Math.floor(Math.random() * urls.length)];
}

function buildActionDesc(action: string, user: string, target?: string): string {
    const actions: Record<string, string> = {
        hug: 'hugs', kiss: 'kisses', slap: 'slaps', pat: 'pats', cuddle: 'cuddles',
        poke: 'pokes', dance: 'dances with', blush: 'blushes at', cry: 'cries with',
        kill: 'kills', bite: 'bites', smug: 'smugs at', baka: 'calls baka',
        happy: 'is happy with', wave: 'waves at', wink: 'winks at', laugh: 'laughs at',
        sleep: 'sleeps with', smile: 'smiles at', highfive: 'highfives', lick: 'licks',
        yeet: 'yeets', punch: 'punches',
    };
    const verb = actions[action] || action;
    if (target) return `**${user}** ${verb} **${target}**`;
    return `**${user}** ${verb}`;
}

export const actionCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('action')
        .setDescription('Perform an action with a GIF')
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('The action to perform')
                .setRequired(true)
                .addChoices(...ACTION_NAMES.map(name => ({ name, value: name })))
        )
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(false)),
    async execute(interaction) {
        const action = interaction.options.getString('type', true);
        const target = interaction.options.getUser('user');
        const desc = buildActionDesc(action, interaction.user.username, target?.username);
        const gif = getGif(action);
        await interaction.reply({ content: `${desc}\n${gif}` });
    },
};
