import {
  RecipeDef,
  RecipeMaterial,
  CraftCheckResult,
  CraftResult,
  GatherSource,
  GatherDrop,
  GatherResult,
  GatheredItem,
  InventoryItem,
} from '../types';
import { SeededRandom, generateId } from '../utils';

export class CraftingRecipe {
  private recipes: Map<string, RecipeDef> = new Map();
  private gatherSources: Map<string, GatherSource> = new Map();
  private sourceRespawnTimers: Map<string, number> = new Map();
  private unlockedRecipes: Set<string> = new Set();
  private rng: SeededRandom;

  private getInventoryItemCount: (defId: string) => number;
  private consumeItemByDefId: (defId: string, quantity: number) => boolean;
  private hasTool: (defId: string) => boolean;
  private addCraftedItem: (defId: string, quantity: number) => InventoryItem | null;

  constructor(
    rng: SeededRandom,
    inventoryCallbacks: {
      getItemCount: (defId: string) => number;
      consumeItemByDefId: (defId: string, quantity: number) => boolean;
      hasTool: (defId: string) => boolean;
      addCraftedItem: (defId: string, quantity: number) => InventoryItem | null;
    }
  ) {
    this.rng = rng;
    this.getInventoryItemCount = inventoryCallbacks.getItemCount;
    this.consumeItemByDefId = inventoryCallbacks.consumeItemByDefId;
    this.hasTool = inventoryCallbacks.hasTool;
    this.addCraftedItem = inventoryCallbacks.addCraftedItem;
  }

  registerRecipe(recipe: RecipeDef): void {
    this.recipes.set(recipe.id, recipe);
  }

  registerRecipes(recipes: RecipeDef[]): void {
    recipes.forEach((r) => this.recipes.set(r.id, r));
  }

  registerGatherSource(source: GatherSource): void {
    this.gatherSources.set(source.id, source);
  }

  registerGatherSources(sources: GatherSource[]): void {
    sources.forEach((s) => this.gatherSources.set(s.id, s));
  }

  unlockRecipe(recipeId: string): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return false;
    this.unlockedRecipes.add(recipeId);
    return true;
  }

  isRecipeUnlocked(recipeId: string): boolean {
    return this.unlockedRecipes.has(recipeId);
  }

  checkUnlockCondition(recipeId: string, conditionEvaluator: (condition: string) => boolean): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe || !recipe.unlockCondition) return true;
    if (conditionEvaluator(recipe.unlockCondition)) {
      this.unlockedRecipes.add(recipeId);
      return true;
    }
    return false;
  }

  canCraft(recipeId: string): CraftCheckResult {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      return {
        canCraft: false,
        missingMaterials: [],
        missingTools: [],
        missingSkill: false,
        missingFacility: false,
        tipText: `未找到配方: ${recipeId}`,
      };
    }

    if (!this.unlockedRecipes.has(recipeId) && recipe.unlockCondition) {
      return {
        canCraft: false,
        missingMaterials: [],
        missingTools: [],
        missingSkill: false,
        missingFacility: false,
        tipText: `配方未解锁，需要满足条件: ${recipe.unlockCondition}`,
      };
    }

    const missingMaterials: RecipeMaterial[] = [];
    for (const mat of recipe.materials) {
      const have = this.getInventoryItemCount(mat.itemId);
      if (have < mat.quantity) {
        missingMaterials.push({ itemId: mat.itemId, quantity: mat.quantity - have });
      }
    }

    const missingTools: string[] = [];
    if (recipe.requiredTools) {
      for (const toolId of recipe.requiredTools) {
        if (!this.hasTool(toolId)) {
          missingTools.push(toolId);
        }
      }
    }

    const result: CraftCheckResult = {
      canCraft: missingMaterials.length === 0 && missingTools.length === 0,
      missingMaterials,
      missingTools,
      missingSkill: false,
      missingFacility: false,
      tipText: '',
    };

    if (result.canCraft) {
      result.tipText = `可以制作: ${recipe.name}`;
    } else {
      const parts: string[] = [];
      if (missingMaterials.length > 0) {
        parts.push(`缺少材料: ${missingMaterials.map((m) => `${m.itemId}×${m.quantity}`).join(', ')}`);
      }
      if (missingTools.length > 0) {
        parts.push(`缺少工具: ${missingTools.join(', ')}`);
      }
      result.tipText = parts.join('；');
    }

    return result;
  }

  craft(recipeId: string): CraftResult {
    const check = this.canCraft(recipeId);
    if (!check.canCraft) {
      return {
        success: false,
        materialsConsumed: false,
        tipText: check.tipText,
      };
    }

    const recipe = this.recipes.get(recipeId)!;

    let allConsumed = true;
    for (const mat of recipe.materials) {
      if (!this.consumeItemByDefId(mat.itemId, mat.quantity)) {
        allConsumed = false;
      }
    }

    if (!allConsumed) {
      return {
        success: false,
        materialsConsumed: false,
        tipText: '材料消耗失败，制作中断。',
      };
    }

    const craftedItem = this.addCraftedItem(recipe.result.itemId, recipe.result.quantity);

    return {
      success: true,
      resultItem: craftedItem ?? undefined,
      materialsConsumed: true,
      tipText: `制作成功！获得 ${recipe.result.name} ×${recipe.result.quantity}`,
    };
  }

  gather(sourceId: string, toolBonus: number = 0): GatherResult {
    const source = this.gatherSources.get(sourceId);
    if (!source) {
      return {
        sourceId,
        items: [],
        exhausted: true,
        tipText: `找不到采集源: ${sourceId}`,
      };
    }

    const remaining = this.sourceRespawnTimers.get(sourceId) ?? 0;
    if (remaining > 0) {
      return {
        sourceId,
        items: [],
        exhausted: true,
        tipText: `${source.name} 已耗尽，将在 ${Math.ceil(remaining)} 小时后恢复。`,
      };
    }

    if (source.requiredTool && !this.hasTool(source.requiredTool)) {
      return {
        sourceId,
        items: [],
        exhausted: false,
        tipText: `需要工具 ${source.requiredTool} 才能采集 ${source.name}。`,
      };
    }

    const gathered: GatheredItem[] = [];
    for (const drop of source.baseDrops) {
      const effectiveChance = Math.min(1, drop.chance + toolBonus * 0.1);
      if (this.rng.chance(effectiveChance)) {
        const quantity = this.rng.nextInt(drop.minQuantity, drop.maxQuantity);
        const bonusQty = Math.floor(quantity * toolBonus * 0.2);
        gathered.push({
          itemId: drop.itemId,
          name: drop.name,
          quantity: quantity + bonusQty,
        });
      }
    }

    this.sourceRespawnTimers.set(sourceId, source.respawnTime);

    const tipText = gathered.length > 0
      ? `从${source.name}采集到: ${gathered.map((g) => `${g.name}×${g.quantity}`).join(', ')}`
      : `${source.name}没有产出任何东西。`;

    return {
      sourceId,
      items: gathered,
      exhausted: false,
      tipText,
    };
  }

  updateRespawnTimers(deltaHours: number): void {
    for (const [sourceId, remaining] of this.sourceRespawnTimers) {
      const newRemaining = remaining - deltaHours;
      if (newRemaining <= 0) {
        this.sourceRespawnTimers.delete(sourceId);
      } else {
        this.sourceRespawnTimers.set(sourceId, newRemaining);
      }
    }
  }

  getRecipe(id: string): RecipeDef | undefined {
    return this.recipes.get(id);
  }

  getAllRecipes(): RecipeDef[] {
    return Array.from(this.recipes.values());
  }

  getUnlockedRecipes(): RecipeDef[] {
    return Array.from(this.recipes.values()).filter((r) => this.unlockedRecipes.has(r.id));
  }

  getGatherSource(id: string): GatherSource | undefined {
    return this.gatherSources.get(id);
  }

  getAllGatherSources(): GatherSource[] {
    return Array.from(this.gatherSources.values());
  }
}
