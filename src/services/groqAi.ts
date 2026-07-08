import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { UserProfile } from '../types/index.js';

interface TicketSuggestInput {
    subject: string;
    category?: string;
    description: string;
    messages: any[];
}

export const groqAi = {
    /**
     * Check if AI features are enabled and configured
     */
    isEnabled(): boolean {
        return !!config.ai.enabled && !!config.ai.apiKey;
    },

    /**
     * General chatbot answer about VictusMC
     */
    async askVictus(
        prompt: string,
        context: {
            discordTag: string;
            discordId: string;
            linked: boolean;
            profile: UserProfile | null;
            publicReply: boolean;
        }
    ): Promise<string> {
        if (!this.isEnabled()) {
            return "⚠️ Victus AI is not currently configured or enabled. Please contact staff for assistance.";
        }

        const systemMessage = `You are the official AI Assistant for VictusMc (a premier Minecraft network).
Your job is to provide accurate, helpful, and polite answers about server status, gameplay, rules, community, support, and how to join.

User context:
- Discord User: ${context.discordTag} (${context.discordId})
- Linked VictusMC Account: ${context.linked ? 'Yes' : 'No'}

Key facts about VictusMC (⚠️ CRITICAL — do NOT make up gamemodes):
- We currently have EXACTLY 2 gamemodes: Lifesteal and PvP. There is NO Survival, Skyblock, Prison, KitPvP, Creative, or any other mode.
- Server IP: play.victusmc.net (Java, latest version).
- Launched on 10th July 2026.
- Website: ${config.branding.website}.

Guidelines:
1. Be concise, professional, and friendly.
2. Use markdown formatting (bolding, lists, code blocks, headers) to make the message visually premium and readable.
3. Guide users to our official store/site: ${config.branding.website}.
4. If they need manual help, remind them they can open a ticket using \`/ticket open\`.
5. Since you are answering inside Discord, keep your response under 1800 characters to prevent splitting issues.
6. If asked about gamemodes, ALWAYS say we have exactly 2: Lifesteal and PvP. Never list any other gamemodes.`;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.ai.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.ai.model || 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: systemMessage },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.error(`Groq API returned error status ${response.status}: ${errText}`);
                return "⚠️ Sorry, I encountered an issue reaching my AI backend. Please try again in a moment.";
            }

            const data = (await response.json()) as any;
            const content = data?.choices?.[0]?.message?.content;
            if (!content) {
                logger.warn('Groq API returned empty chat completion response');
                return "⚠️ I couldn't formulate a response right now. Please try again.";
            }

            return content.trim();
        } catch (error) {
            logger.error('Error invoking Groq AI askVictus:', error);
            return "⚠️ A network error occurred while communicating with my AI brain. Please try again later.";
        }
    },

    /**
     * Suggest an answer/next steps for a support ticket based on its history
     */
    async suggestForTicket(input: TicketSuggestInput): Promise<string> {
        if (!this.isEnabled()) {
            return "⚠️ Groq AI assistant is not enabled. Cannot generate ticket suggestions.";
        }

        const formattedMessages = input.messages
            .slice(-10) // last 10 messages for context
            .map((m: any) => `[${m.author_is_staff ? 'Staff' : 'Customer'} - ${m.author_username || 'User'}]: ${m.content}`)
            .join('\n');

        const systemMessage = `You are a VictusMC Community Support Assistant and Ticket Assistant.
Your job is to read the ticket description, subject, category, and recent message thread, and provide a professional, structured suggestion for staff on how to answer this ticket or resolve the player's issue.

Provide a step-by-step troubleshooting path or direct response text. Keep it concise.`;

        const userPrompt = `Ticket Details:
- Subject: ${input.subject}
- Category: ${input.category || 'General Support'}
- Description: ${input.description}

Recent Messages:
${formattedMessages || '_No messages yet in this ticket thread._'}

Generate a professional response outline or recommended reply:`;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.ai.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.ai.model || 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: systemMessage },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.5,
                    max_tokens: 600
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                logger.error(`Groq API returned error status ${response.status} for ticket suggest: ${errText}`);
                return "⚠️ Failed to communicate with Groq AI for ticket suggestion.";
            }

            const data = (await response.json()) as any;
            const content = data?.choices?.[0]?.message?.content;
            if (!content) {
                return "⚠️ Empty suggestion returned from the AI assistant.";
            }

            return content.trim();
        } catch (error) {
            logger.error('Error invoking Groq AI suggestForTicket:', error);
            return "⚠️ A network error occurred while generating a ticket suggestion.";
        }
    }
};
