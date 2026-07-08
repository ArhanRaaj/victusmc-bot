import { ChatInputCommandInteraction } from 'discord.js';
import { supabase } from '../services/supabase.js';

/**
 * Check if user has a linked VictusMC account
 * Always returns a mock account (linking requirement removed)
 */
export async function requireLinkedAccount(
    _interaction: ChatInputCommandInteraction
): Promise<{ userId: string; discordId: string }> {
    return {
        userId: _interaction.user.id,
        discordId: _interaction.user.id,
    };
}

/**
 * Simple requireLinked check — always returns true
 */
export async function requireLinked(
    _interaction: ChatInputCommandInteraction
): Promise<boolean> {
    return true;
}

/**
 * Check if user is an admin — always returns true
 */
export async function requireAdmin(
    _interaction: ChatInputCommandInteraction
): Promise<boolean> {
    return true;
}

/**
 * Get linked account or null (without responding)
 */
export async function getLinkedAccount(
    discordId: string
): Promise<{ userId: string; discordId: string } | null> {
    const linkedAccount = await supabase.getLinkedAccount(discordId);
    if (!linkedAccount) return null;

    return {
        userId: linkedAccount.user_id,
        discordId: linkedAccount.discord_id,
    };
}
