import { AgentManifest, Message, AgentContext, AgentResponse } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class CookingAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'cooking',
    name: 'Chef & Meal Planner',
    description: 'Get recipe suggestions, plan weekly meals, generate grocery lists, and track what\'s in your pantry.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'chef-hat',
    category: 'lifestyle',
    capabilities: [
      { id: 'recipes', name: 'Recipe Finder', description: 'Find recipes by ingredients or cuisine', keywords: ['recipe', 'cook', 'make', 'dish', 'cuisine', 'dinner', 'lunch', 'breakfast'] },
      { id: 'meal_plan', name: 'Meal Planner', description: 'Plan weekly meals', keywords: ['meal plan', 'weekly menu', 'what to eat', 'plan meals'] },
      { id: 'grocery', name: 'Smart Grocery List', description: 'Auto-generate grocery lists from meal plans', keywords: ['grocery', 'ingredients', 'pantry', 'buy groceries'] },
    ],
    widgets: [
      { id: 'todays_meals', name: "Today's Menu", size: 'small' },
    ],
    requiredPermissions: ['recipes', 'meal_plans'],
    optionalPermissions: ['shopping_lists', 'nutrition'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    if (content.includes('recipe') || content.includes('cook') || content.includes('make')) {
      return this.respond("What are you in the mood for? I can suggest recipes based on cuisine, ingredients, or dietary preferences.", {
        suggestions: ['Quick meals (<30 min)', 'What can I make with...', 'Healthy options', 'Browse cuisines'],
      });
    }
    if (content.includes('meal plan') || content.includes('weekly')) {
      return this.respond("I'll create a meal plan for you! Any dietary preferences or constraints?", {
        suggestions: ['Balanced plan', 'Vegetarian', 'High protein', 'Budget-friendly'],
      });
    }
    if (content.includes('dinner') || content.includes('lunch') || content.includes('breakfast')) {
      return this.respond("Let me suggest some options! How much time do you have and any preferences?", {
        suggestions: ['Quick & easy', 'Something special', 'Leftover-friendly', 'Kid-friendly'],
      });
    }

    return this.respond("I'm your personal chef assistant! Recipes, meal planning, and smart grocery lists.", {
      suggestions: ['What to cook today', 'Plan this week', 'Generate grocery list', 'My saved recipes'],
    });
  }
}
