// Memory-backed store for channels where the AI is summoned
const summonedChannels = new Set<string>();

/**
 * Check if a channel has been summoned for AI assistance
 */
export function isChannelSummoned(channelId: string): boolean {
    return summonedChannels.has(channelId);
}

/**
 * Add a channel to the summoned set
 */
export function summonChannel(channelId: string): void {
    summonedChannels.add(channelId);
}

/**
 * Remove a channel from the summoned set
 */
export function unsummonChannel(channelId: string): void {
    summonedChannels.delete(channelId);
}
