import { AgentManifest, Message, AgentContext, AgentResponse, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class FitnessAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'fitness',
    name: 'Fitness & Health Coach',
    description: 'Track workouts, nutrition, weight, sleep, and medications. Get personalized health insights and workout plans.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'heart-pulse',
    category: 'health',
    capabilities: [
      { id: 'track_workouts', name: 'Workout Tracker', description: 'Log exercises and routines', keywords: ['workout', 'exercise', 'gym', 'run', 'walk', 'yoga', 'cardio'] },
      { id: 'track_nutrition', name: 'Nutrition Tracker', description: 'Log meals and calories', keywords: ['calories', 'food', 'meal', 'diet', 'protein', 'carbs', 'nutrition'] },
      { id: 'track_vitals', name: 'Vital Signs', description: 'Weight, BP, heart rate, sleep', keywords: ['weight', 'blood pressure', 'sleep', 'heart rate', 'steps'] },
      { id: 'medications', name: 'Medication Reminders', description: 'Track medicines and schedules', keywords: ['medicine', 'medication', 'pill', 'prescription', 'dose'] },
    ],
    widgets: [
      { id: 'daily_stats', name: 'Today\'s Stats', size: 'medium' },
      { id: 'weight_chart', name: 'Weight Trend', size: 'small' },
    ],
    requiredPermissions: ['health_metrics', 'workouts'],
    optionalPermissions: ['nutrition', 'medications'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();
    const intent = this.analyzeIntent(message, context);

    // Try AI first for contextual responses
    const vaultData = this.getVaultDataSummary(context, ['health_metrics', 'workouts', 'nutrition']);
    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Log workout', 'Log food', 'Log weight', 'My health summary'] });
    }

    if (content.includes('workout') || content.includes('exercise') || content.includes('gym')) {
      return this.respondWithContext(intent, context,
        "Let's log your workout! What did you do today?", {
          suggestions: ['Strength training', 'Running', 'Yoga', 'Custom workout'],
        });
    }
    if (content.includes('calorie') || content.includes('food') || content.includes('ate') || content.includes('meal')) {
      return this.respondWithContext(intent, context,
        "I'll help track your nutrition. What did you eat?", {
          suggestions: ['Log a meal', 'Today\'s calories', 'Macro breakdown', 'Meal suggestions'],
        });
    }
    if (content.includes('weight')) {
      return this.respondWithContext(intent, context,
        "Let me check your weight trend. Would you like to log today's weight?", {
          suggestions: ['Log weight', 'Show weight chart', 'Set target weight'],
        });
    }
    if (content.includes('sleep')) {
      return this.respondWithContext(intent, context,
        "How was your sleep? I can help track your sleep patterns.", {
          suggestions: ['Log last night\'s sleep', 'Sleep trend', 'Set bedtime reminder'],
        });
    }

    // Generic fallback — acknowledge cross-agent context
    const crossNote = this.getCrossAgentContext(intent, context);
    if (crossNote) {
      return this.respond(
        `${crossNote}\n\nAs your Fitness & Health Coach, I can track workouts, nutrition, vitals, and medications. What would you like to do?`, {
          suggestions: ['Log workout', 'Log food', 'Log weight', 'My health summary'],
        });
    }

    return this.respond("I'm your health & fitness coach! I can track workouts, nutrition, vitals, and medications.", {
      suggestions: ['Log workout', 'Log food', 'Log weight', 'My health summary'],
    });
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    return [
      this.insight('Medication Reminder', 'Time for your evening vitamins', 'medium', {
        label: 'Mark as Taken',
        type: 'confirm_action',
        payload: { action: 'mark_medication_taken' },
      }),
    ];
  }
}
