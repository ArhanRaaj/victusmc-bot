/**
 * Run: node scripts/unregister-commands.js
 *
 * Unregisters ALL global + guild slash commands via Discord REST API.
 * Respects rate limits (Retry-After).
 * After running, restart the bot to re-register only the current commands.
 */

import 'dotenv/config';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_SUPPORT_GUILD_ID;

if (!token || !clientId) {
    console.error('❌ DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in .env');
    process.exit(1);
}

const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
const api = 'https://discord.com/api/v10';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = 5) {
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, options);
        if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10) + 1;
            console.log(`⏳ Rate limited. Waiting ${retryAfter}s...`);
            await sleep(retryAfter * 1000);
            continue;
        }
        return res;
    }
    throw new Error(`Exceeded retries for ${url}`);
}

async function unregisterAll(endpoint, label) {
    try {
        const res = await fetchWithRetry(endpoint, { headers });
        if (!res.ok) { console.error(`Failed to fetch ${label}: ${res.status}`); return; }
        const commands = await res.json();
        console.log(`Found ${commands.length} ${label}.`);

        let deleted = 0;
        for (const cmd of commands) {
            try {
                const del = await fetchWithRetry(`${endpoint}/${cmd.id}`, { method: 'DELETE', headers });
                if (del.ok) { console.log(`Deleted: /${cmd.name}`); deleted++; }
                else console.error(`Failed to delete /${cmd.name}: ${del.status}`);
            } catch (err) {
                console.error(`Error deleting /${cmd.name}:`, err.message);
            }
            // Small delay between deletes to avoid burst rate limits
            await sleep(500);
        }
        console.log(`✅ ${label}: ${deleted}/${commands.length} deleted.`);
    } catch (err) {
        console.error(`❌ Error unregistering ${label}:`, err);
    }
}

await unregisterAll(`${api}/applications/${clientId}/commands`, 'global commands');
if (guildId) {
    console.log('');
    await unregisterAll(`${api}/applications/${clientId}/guilds/${guildId}/commands`, 'guild commands');
}

console.log('\nDone. Restart the bot to re-register commands.');
