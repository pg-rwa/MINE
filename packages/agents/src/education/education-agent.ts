import { AgentManifest, Message, AgentContext, AgentResponse } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class EducationAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'education',
    name: 'Learning Coach',
    description: 'Set learning goals, track courses, create study plans, get explanations, and build knowledge over time.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'graduation-cap',
    category: 'education',
    capabilities: [
      { id: 'study_plans', name: 'Study Planner', description: 'Create structured learning paths', keywords: ['study', 'learn', 'course', 'tutorial', 'education', 'skill'] },
      { id: 'explain', name: 'Explainer', description: 'AI-powered explanations of any topic', keywords: ['explain', 'what is', 'how does', 'teach', 'understand'] },
      { id: 'track_progress', name: 'Progress Tracker', description: 'Track learning streaks and progress', keywords: ['progress', 'streak', 'completed', 'quiz', 'practice'] },
    ],
    widgets: [
      { id: 'learning_streak', name: 'Learning Streak', size: 'small' },
    ],
    requiredPermissions: ['courses', 'study_plans'],
    optionalPermissions: ['calendar', 'bookmarks'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    // Try AI first for contextual responses
    const vaultData = this.getVaultDataSummary(context, ['courses', 'study_plans']);
    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Start learning something', 'Continue where I left off', 'Quiz me', 'My progress'] });
    }

    if (content.includes('learn') || content.includes('study') || content.includes('course')) {
      return this.respond("What would you like to learn? I can create a structured study plan.", {
        suggestions: ['Programming', 'Language', 'Finance basics', 'Custom topic'],
      });
    }
    if (content.includes('explain') || content.includes('what is') || content.includes('how does')) {
      return this.respond("I'd be happy to explain! Let me break it down for you in simple terms.");
    }

    return this.respond("I help you learn anything — structured plans, daily practice, and AI explanations.", {
      suggestions: ['Start learning something', 'Continue where I left off', 'Quiz me', 'My progress'],
    });
  }
}
