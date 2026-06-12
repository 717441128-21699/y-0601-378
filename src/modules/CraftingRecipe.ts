import {
  RecipeDef,
  RecipeMaterial,
  CraftCheckResult,
  CraftResult,
  CraftPreview,
  GatherSource,
  GatherResult,
  GatherPreview,
  GatheredItem,
  InventoryItem,
} from '../types';
import { SeededRandom } from '../utils';

export interface CraftingCallbacks {
  getItemCount: (defId: string) => number;
  consumeItemByDefId: (defId: string, quantity: number) => boolean;
  hasTool: (defId: string) => boolean;
  addItem: (defId: string, quantity: number) => InventoryItem | null;
  addItemWithOverflow: (defId: string, quantity: number) => { added: InventoryItem[]; overflowCount: number };
  getSkillLevel: () => number;
  hasFacility: (facilityType: string) => boolean;
  getFacilityName: (facilityType: string) => string | null;
  getInventoryFreeSlots: () => number;
  isFood: (defId: string) => boolean;
  isTool: (defId: string) => boolean;
  hasExistingStack: (defId: string) => boolean;
}

export class CraftingRecipe {
  private recipes: Map<string, RecipeDef> = new Map();
  private gatherSources: Map<string, GatherSource> = new Map();
  private sourceRespawnTimers: Map<string, number> = new Map();
  private unlockedRecipes: Set<string> = new Set();
  private rng: SeededRandom;
  private cb: CraftingCallbacks;

  constructor(rng: SeededRandom, callbacks: CraftingCallbacks) {
    this.rng = rng;
    this.cb = callbacks;
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

  previewCraft(recipeId: string): CraftPreview {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      return {
        canCraft: false,
        materialsToConsume: [],
        toolsRequired: [],
        skillRequired: 0,
        currentSkill: this.cb.getSkillLevel(),
        facilityRequired: null,
        facilityPresent: true,
        resultItem: { itemId: '', name: '', quantity: 0 },
        freeSlots: this.cb.getInventoryFreeSlots(),
        slotsNeeded: 0,
        willOverflow: false,
        overflowCount: 0,
        actualAddable: 0,
        unlockStatus: 'no_condition',
        blockReasons: [`未找到配方: ${recipeId}`],
        tipText: `未找到配方: ${recipeId}`,
      };
    }

    const currentSkill = this.cb.getSkillLevel();
    const requiredSkill = recipe.requiredSkill ?? 0;
    const skillOk = currentSkill >= requiredSkill;

    const facilityRequired = recipe.requiredFacility ?? null;
    const facilityPresent = !facilityRequired || this.cb.hasFacility(facilityRequired);

    const isUnlocked = !recipe.unlockCondition || this.unlockedRecipes.has(recipeId);
    const unlockStatus: CraftPreview['unlockStatus'] = !recipe.unlockCondition
      ? 'no_condition'
      : isUnlocked ? 'unlocked' : 'locked';

    const freeSlots = this.cb.getInventoryFreeSlots();
    const isFoodResult = this.cb.isFood(recipe.result.itemId);
    const hasStack = this.cb.hasExistingStack(recipe.result.itemId);
    const slotsNeeded = (isFoodResult && hasStack) ? 0 : 1;
    const willOverflow = freeSlots < slotsNeeded;
    const overflowCount = willOverflow ? recipe.result.quantity : 0;
    const actualAddable = willOverflow ? 0 : recipe.result.quantity;

    const missingMaterials: RecipeMaterial[] = [];
    for (const mat of recipe.materials) {
      const have = this.cb.getItemCount(mat.itemId);
      if (have < mat.quantity) {
        missingMaterials.push({ itemId: mat.itemId, quantity: mat.quantity - have });
      }
    }

    const missingTools: string[] = [];
    if (recipe.requiredTools) {
      for (const toolId of recipe.requiredTools) {
        if (!this.cb.hasTool(toolId)) {
          missingTools.push(toolId);
        }
      }
    }

    const blockReasons: string[] = [];
    if (!isUnlocked) blockReasons.push(`配方未解锁，需满足: ${recipe.unlockCondition}`);
    if (missingMaterials.length > 0) {
      blockReasons.push(`缺少材料: ${missingMaterials.map((m) => `${m.itemId}×${m.quantity}`).join(', ')}`);
    }
    if (missingTools.length > 0) blockReasons.push(`缺少工具: ${missingTools.join(', ')}`);
    if (!skillOk) blockReasons.push(`技能不足: 需要等级 ${requiredSkill}，当前等级 ${currentSkill}`);
    if (!facilityPresent) blockReasons.push(`缺少设施: 需要${this.cb.getFacilityName(facilityRequired!) ?? facilityRequired}`);
    if (willOverflow) blockReasons.push(`背包已满（剩余空位: ${freeSlots}，需要: ${slotsNeeded}）`);

    const canCraft = isUnlocked
      && missingMaterials.length === 0
      && missingTools.length === 0
      && skillOk
      && facilityPresent
      && !willOverflow;

    return {
      canCraft,
      materialsToConsume: recipe.materials.map((m) => ({ ...m })),
      toolsRequired: recipe.requiredTools ?? [],
      skillRequired: requiredSkill,
      currentSkill,
      facilityRequired,
      facilityPresent,
      resultItem: { ...recipe.result },
      freeSlots,
      slotsNeeded,
      willOverflow,
      overflowCount,
      actualAddable,
      unlockStatus,
      blockReasons,
      tipText: canCraft
        ? `可以制作: ${recipe.name}，消耗 ${recipe.materials.map((m) => `${m.itemId}×${m.quantity}`).join(', ')}，产出 ${recipe.result.name}×${recipe.result.quantity}`
        : blockReasons.join('；'),
    };
  }

  canCraft(recipeId: string): CraftCheckResult {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      return {
        canCraft: false,
        unlocked: false,
        missingMaterials: [],
        missingTools: [],
        missingSkill: false,
        missingFacility: false,
        inventoryFull: false,
        inventoryFreeSlots: this.cb.getInventoryFreeSlots(),
        tipText: `未找到配方: ${recipeId}`,
      };
    }

    const isUnlocked = !recipe.unlockCondition || this.unlockedRecipes.has(recipeId);
    if (!isUnlocked) {
      return {
        canCraft: false,
        unlocked: false,
        missingMaterials: [],
        missingTools: [],
        missingSkill: false,
        missingFacility: false,
        inventoryFull: false,
        inventoryFreeSlots: this.cb.getInventoryFreeSlots(),
        tipText: `配方「${recipe.name}」未解锁，需要满足条件: ${recipe.unlockCondition}`,
      };
    }

    const missingMaterials: RecipeMaterial[] = [];
    for (const mat of recipe.materials) {
      const have = this.cb.getItemCount(mat.itemId);
      if (have < mat.quantity) {
        missingMaterials.push({ itemId: mat.itemId, quantity: mat.quantity - have });
      }
    }

    const missingTools: string[] = [];
    if (recipe.requiredTools) {
      for (const toolId of recipe.requiredTools) {
        if (!this.cb.hasTool(toolId)) {
          missingTools.push(toolId);
        }
      }
    }

    const currentSkill = this.cb.getSkillLevel();
    const requiredSkill = recipe.requiredSkill ?? 0;
    const missingSkill = currentSkill < requiredSkill;

    const hasRequiredFacility = !recipe.requiredFacility || this.cb.hasFacility(recipe.requiredFacility);
    const missingFacility = !hasRequiredFacility;
    const requiredFacilityName = recipe.requiredFacility
      ? this.cb.getFacilityName(recipe.requiredFacility)
      : undefined;

    const freeSlots = this.cb.getInventoryFreeSlots();
    const isFoodResult = this.cb.isFood(recipe.result.itemId);
    const hasStack = this.cb.hasExistingStack(recipe.result.itemId);
    const needsSlot = (isFoodResult && hasStack) ? false : recipe.result.quantity > 0;
    const inventoryFull = needsSlot && freeSlots <= 0;

    const canCraft = missingMaterials.length === 0
      && missingTools.length === 0
      && !missingSkill
      && !missingFacility
      && !inventoryFull;

    const parts: string[] = [];
    if (missingMaterials.length > 0) {
      parts.push(`缺少材料: ${missingMaterials.map((m) => `${m.itemId}×${m.quantity}`).join(', ')}`);
    }
    if (missingTools.length > 0) {
      parts.push(`缺少工具: ${missingTools.join(', ')}`);
    }
    if (missingSkill) {
      parts.push(`技能不足: 需要等级 ${requiredSkill}，当前等级 ${currentSkill}`);
    }
    if (missingFacility) {
      parts.push(`缺少设施: 需要${requiredFacilityName ?? recipe.requiredFacility}`);
    }
    if (inventoryFull) {
      parts.push(`背包已满，无法放入制作产物（剩余空位: ${freeSlots}）`);
    }

    return {
      canCraft,
      unlocked: isUnlocked,
      missingMaterials,
      missingTools,
      missingSkill,
      currentSkill: missingSkill ? currentSkill : undefined,
      requiredSkill: missingSkill ? requiredSkill : undefined,
      missingFacility,
      requiredFacilityName: requiredFacilityName ?? undefined,
      inventoryFull,
      inventoryFreeSlots: freeSlots,
      tipText: canCraft ? `可以制作: ${recipe.name}` : parts.join('；'),
    };
  }

  craft(recipeId: string): CraftResult {
    const check = this.canCraft(recipeId);
    if (!check.canCraft) {
      return {
        success: false,
        materialsConsumed: false,
        inventoryFull: check.inventoryFull,
        itemsActuallyAdded: 0,
        itemsOverflow: 0,
        tipText: check.tipText,
      };
    }

    const recipe = this.recipes.get(recipeId)!;

    const consumedMap = new Map<string, { needed: number; consumed: number }>();
    for (const mat of recipe.materials) {
      consumedMap.set(mat.itemId, { needed: mat.quantity, consumed: 0 });
    }

    let allConsumed = true;
    for (const mat of recipe.materials) {
      const before = this.cb.getItemCount(mat.itemId);
      const ok = this.cb.consumeItemByDefId(mat.itemId, mat.quantity);
      const after = this.cb.getItemCount(mat.itemId);
      const actuallyConsumed = before - after;
      const entry = consumedMap.get(mat.itemId)!;
      entry.consumed = actuallyConsumed;
      if (!ok) allConsumed = false;
    }

    if (!allConsumed) {
      const details = Array.from(consumedMap.entries())
        .filter(([, e]) => e.consumed < e.needed)
        .map(([id, e]) => `${id}需要${e.needed}实际消耗${e.consumed}`)
        .join(', ');
      return {
        success: false,
        materialsConsumed: false,
        inventoryFull: false,
        itemsActuallyAdded: 0,
        itemsOverflow: 0,
        tipText: `材料消耗不足，制作中断。${details}`,
      };
    }

    const { added, overflowCount } = this.cb.addItemWithOverflow(
      recipe.result.itemId,
      recipe.result.quantity
    );

    const itemsActuallyAdded = added.reduce((s, i) => s + i.quantity, 0);

    if (overflowCount > 0) {
      return {
        success: true,
        resultItem: added[0] ?? undefined,
        materialsConsumed: true,
        inventoryFull: true,
        itemsActuallyAdded,
        itemsOverflow: overflowCount,
        tipText: `制作成功，但背包空间不足！获得 ${recipe.result.name} ×${itemsActuallyAdded}，有 ${overflowCount} 个物品溢出丢失。`,
      };
    }

    return {
      success: true,
      resultItem: added[0] ?? undefined,
      materialsConsumed: true,
      inventoryFull: false,
      itemsActuallyAdded,
      itemsOverflow: 0,
      tipText: `制作成功！获得 ${recipe.result.name} ×${recipe.result.quantity}`,
    };
  }

  previewGather(sourceId: string, toolBonus: number = 0): GatherPreview {
    const source = this.gatherSources.get(sourceId);
    if (!source) {
      return {
        canGather: false,
        reason: `找不到采集源: ${sourceId}`,
        potentialDrops: [],
        freeSlots: 0,
        estimatedMaxItems: 0,
        potentialOverflow: false,
        tipText: `找不到采集源: ${sourceId}`,
      };
    }

    const remaining = this.sourceRespawnTimers.get(sourceId) ?? 0;
    if (remaining > 0) {
      return {
        canGather: false,
        reason: `${source.name} 已耗尽，将在 ${Math.ceil(remaining)} 小时后恢复`,
        potentialDrops: source.baseDrops.map((d) => ({
          itemId: d.itemId, name: d.name, minQty: d.minQuantity, maxQty: d.maxQuantity, chance: d.chance,
        })),
        freeSlots: this.cb.getInventoryFreeSlots(),
        estimatedMaxItems: 0,
        potentialOverflow: true,
        tipText: `${source.name} 已耗尽，将在 ${Math.ceil(remaining)} 小时后恢复。`,
      };
    }

    if (source.requiredTool && !this.cb.hasTool(source.requiredTool)) {
      return {
        canGather: false,
        reason: `需要工具 ${source.requiredTool}`,
        potentialDrops: source.baseDrops.map((d) => ({
          itemId: d.itemId, name: d.name, minQty: d.minQuantity, maxQty: d.maxQuantity, chance: d.chance,
        })),
        freeSlots: this.cb.getInventoryFreeSlots(),
        estimatedMaxItems: 0,
        potentialOverflow: false,
        tipText: `需要工具 ${source.requiredTool} 才能采集 ${source.name}。`,
      };
    }

    const freeSlots = this.cb.getInventoryFreeSlots();
    const potentialDrops = source.baseDrops.map((d) => ({
      itemId: d.itemId,
      name: d.name,
      minQty: d.minQuantity,
      maxQty: d.maxQuantity,
      chance: Math.min(1, d.chance + toolBonus * 0.1),
    }));
    const estimatedMaxItems = potentialDrops.reduce((s, d) => s + d.maxQty, 0);
    const potentialOverflow = estimatedMaxItems > freeSlots && freeSlots > 0;

    return {
      canGather: true,
      reason: '',
      potentialDrops,
      freeSlots,
      estimatedMaxItems,
      potentialOverflow,
      tipText: potentialOverflow
        ? `背包空位有限（${freeSlots}），部分产出可能溢出。`
        : `可以从${source.name}采集，预计产出 ${estimatedMaxItems} 件物品。`,
    };
  }

  gather(sourceId: string, toolBonus: number = 0): GatherResult {
    const source = this.gatherSources.get(sourceId);
    if (!source) {
      return {
        sourceId,
        items: [],
        addedToInventory: [],
        overflowItems: [],
        exhausted: true,
        tipText: `找不到采集源: ${sourceId}`,
      };
    }

    const remaining = this.sourceRespawnTimers.get(sourceId) ?? 0;
    if (remaining > 0) {
      return {
        sourceId,
        items: [],
        addedToInventory: [],
        overflowItems: [],
        exhausted: true,
        tipText: `${source.name} 已耗尽，将在 ${Math.ceil(remaining)} 小时后恢复。`,
      };
    }

    if (source.requiredTool && !this.cb.hasTool(source.requiredTool)) {
      return {
        sourceId,
        items: [],
        addedToInventory: [],
        overflowItems: [],
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

    const addedToInventory: GatheredItem[] = [];
    const overflowItems: GatheredItem[] = [];

    for (const item of gathered) {
      const { added, overflowCount } = this.cb.addItemWithOverflow(item.itemId, item.quantity);
      const actualAdded = added.reduce((s, i) => s + i.quantity, 0);
      if (actualAdded > 0) {
        addedToInventory.push({ ...item, quantity: actualAdded });
      }
      if (overflowCount > 0) {
        overflowItems.push({ ...item, quantity: overflowCount });
      }
    }

    let tipText = '';
    if (gathered.length === 0) {
      tipText = `${source.name}没有产出任何东西。`;
    } else if (overflowItems.length > 0) {
      const overflowDesc = overflowItems.map((g) => `${g.name}×${g.quantity}`).join(', ');
      tipText = `从${source.name}采集到物品，但背包空间不足，${overflowDesc} 溢出丢失！`;
    } else {
      tipText = `从${source.name}采集到: ${addedToInventory.map((g) => `${g.name}×${g.quantity}`).join(', ')}`;
    }

    return {
      sourceId,
      items: gathered,
      addedToInventory,
      overflowItems,
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
