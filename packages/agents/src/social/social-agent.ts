import { AgentManifest, Message, AgentContext, AgentResponse } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class SocialAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'social',
    name: 'Social Media Manager',
    description: 'Schedule posts, track engagement, manage multiple platforms, and get content ideas.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'share-2',
    category: 'social',
    capabilities: [
      { id: 'schedule_posts', name: 'Post Scheduler', description: 'Schedule posts across platforms', keywords: ['post', 'tweet', 'publish', 'schedule', 'social media'] },
      { id: 'analytics', name: 'Engagement Analytics', description: 'Track likes, shares, followers', keywords: ['analytics', 'engagement', 'followers', 'likes', 'reach'] },
      { id: 'content_ideas', name: 'Content Ideas', description: 'AI-generated content suggestions', keywords: ['content', 'idea', 'what to post', 'trending'] },
    ],
    widgets: [
      { id: 'engagement_summary', name: 'Engagement', size: 'small' },
    ],
    requiredPermissions: ['social_posts'],
    optionalPermissions: ['contacts', 'documents'],
    requiredPlan: 'premium',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    // Try AI first for contextual responses
    const aiResponse = await this.generateAIResponse(message, context);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Create a post', 'View analytics', 'Content ideas', 'Schedule queue'] });
    }

    if (content.includes('post') || content.includes('publish') || content.includes('tweet')) {
      return this.respond("I'll help you create a post. Which platforms? And what's the topic?", {
        suggestions: ['Twitter/X', 'LinkedIn', 'Instagram', 'All platforms'],
      });
    }
    if (content.includes('analytics') || content.includes('engagement')) {
      return this.respond("Here's your engagement summary across platforms for this week.");
    }

    return this.respond("I manage your social media presence — posting, analytics, and content ideas.", {
      suggestions: ['Create a post', 'View analytics', 'Content ideas', 'Schedule queue'],
    });
  }
}
