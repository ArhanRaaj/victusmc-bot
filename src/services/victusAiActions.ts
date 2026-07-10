interface ActionResult {
    handled: boolean;
    content: string;
    dmContent?: string;
}

export const victusAiActions = {
    /**
     * Parse the user prompt and handle it if it matches specific Minecraft community intents.
     */
    async tryHandle(
        prompt: string,
        context: { discordId: string; publicReply: boolean }
    ): Promise<ActionResult> {
        const cleanedPrompt = prompt.toLowerCase().trim();

        // 1. IP / How to join
        if (/\b(ip|address|connect|join|play|port)\b/i.test(cleanedPrompt)) {
            return {
                handled: true,
                content: `🎮 **How to Join VictusMC:**\n\n` +
                    `› **Server IP:** \`play.victusmc.net\`\n` +
                    `› **Platform:** Java Edition\n` +
                    `› **Version:** Latest Version (1.20+ recommended)\n\n` +
                    `Add the server to your multiplayer list and connect! If you need help, feel free to open a support ticket using \`/ticket open\`.`,
            };
        }

        // 2. Rules
        if (/\b(rules|rule|guidelines|tos|terms)\b/i.test(cleanedPrompt)) {
            return {
                handled: true,
                content: `📦 **VictusMC Server Rules:**\n\n` +
                    `1. **Be Respectful:** Treat all community members and staff with respect.\n` +
                    `2. **No Cheating/Hacking:** Hacked clients, x-ray, and unfair advantages are strictly prohibited.\n` +
                    `3. **No Griefing:** Do not destroy or steal others' creations or property.\n` +
                    `4. **No Spamming/Advertising:** Keep chat clean of spam, links, and promos.\n\n` +
                    `For the full detailed list of rules, please refer to the rules channel in Discord or visit our site.`,
            };
        }

        // 3. Gamemodes
        if (/\b(gamemodes?|game ?modes?|what gamemodes?|modes|how many|list gamemode|lifesteal|pvp|kit|kitpvp|practice|survival|skyblock|factions|prison)\b/i.test(cleanedPrompt)) {
            return {
                handled: true,
                content: `🎮 **VictusMC Gamemodes:**\n\n` +
                    `We currently have **2 gamemodes:**\n\n` +
                    `**1. Lifesteal**\n` +
                    `› Fight players to steal their hearts! Lose all your hearts and you're out.\n` +
                    `› Use /lifesteal to check your heart count.\n\n` +
                    `**2. PvP**\n` +
                    `› Competitive player-vs-player action with arenas and ranked matches.\n` +
                    `› Practice your skills and climb the leaderboards!\n\n` +
                    `More gamemodes coming soon. Stay tuned!`,
            };
        }

        // 4. Launch date
        if (/\b(launch|launched|when.*(open|start|release|created)|server.*(age|old|created)|release date|when was)\b/i.test(cleanedPrompt)) {
            return {
                handled: true,
                content: `🎉 **VictusMC** officially launched on **10th July 2026**! We're excited to have you here.`,
            };
        }

        // 5. Store / website
        if (/\b(store|shop|buy|donate|purchase|website|rank|ranks)\b/i.test(cleanedPrompt)) {
            return {
                handled: true,
                content: `🛒 **VictusMC Store & Website:**\n\n` +
                    `› **Website:** https://victusmc.net\n` +
                    `› **Store:** https://victusmc.net/store\n\n` +
                    `You can purchase rank upgrades, keys, and support the network directly through the store.`,
            };
        }

        return { handled: false, content: '' };
    }
};
