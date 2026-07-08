import 'dotenv/config';

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

export const config = {
    // Discord
    discord: {
        token: process.env.DISCORD_TOKEN!,
        clientId: process.env.DISCORD_CLIENT_ID!,
        guildId: process.env.DISCORD_GUILD_ID, // Optional: for guild-specific commands during dev
    },

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL!,
        serviceKey: process.env.SUPABASE_SERVICE_KEY!,
    },

    // Lavalink (music)
    lavalink: {
        id: process.env.LAVALINK_ID || 'victus-de1',
        host: process.env.LAVALINK_HOST || '135.125.222.36',
        port: parseInt(process.env.LAVALINK_PORT || '25578', 10),
        password: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: process.env.LAVALINK_SECURE === 'true',
        defaultSource: process.env.LAVALINK_SEARCH || 'ytsearch',
        defaultVolume: parseInt(process.env.LAVALINK_VOLUME || '80', 10),
    },

    // Bot Settings
    bot: {
        logLevel: process.env.LOG_LEVEL || 'info',
        supportGuildId: process.env.DISCORD_SUPPORT_GUILD_ID || '', // Main support server ID
        autoRegisterCommands: process.env.DISCORD_AUTO_REGISTER_COMMANDS !== 'false',
        uptimePushUrl: process.env.UPTIME_KUMA_PUSH_URL || 'https://status.victusmc.net/api/push/KPHJ8IOmDd',
        aiChannelId: process.env.DISCORD_AI_CHANNEL_ID || '',
    },

    // AI Settings
    ai: {
        enabled: process.env.AI_ENABLED !== 'false', // Default to true if not explicitly false
        apiKey: process.env.GROQ_API_KEY || '',
        model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    },

    // VictusMc Branding
    branding: {
        name: 'VictusMc',
        color: 0x5865f2, // Blurple
        logo: 'https://victusmc.net/favicon.png',
        banner: 'https://cdn.discordapp.com/attachments/1416827980004724766/1523993256961118299/wmremove-transformed.png',
        website: 'https://victusmc.net',
    },
} as const;

export type Config = typeof config;
