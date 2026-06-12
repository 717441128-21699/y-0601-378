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
import { SeededRandom, generateId } from '../utils';

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

interface InventoryPlan {
  slotsNeeded: number;
  actualAddable: number;
  overflowCount: number;
  isFood: boolean;
  hasExistingStack: boolean;
  willOverflow: boolean;
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

  private calcInventoryPlan(defId: string, quantity: number, freeSlots: number): InventoryPlan {
    const isFood = this.cb.isFood(defId);
    const hasExistingStack = this.cb.hasExistingStack(defId);

    let slotsNeeded: number;
    let actualAddable: number;
    let overflowCount: number;

    if (isFood) {
      if (hasExistingStack) {
        slotsNeeded = 0;
        actualAddable = quantity;
        overflowCount = 0;
      } else {
        slotsNeeded = 1;
        if (freeSlots >= slotsNeeded) {
          actualAddable = quantity;
          overflowCount = 0;
        } else {
          actualAddable = 0;
          overflowCount = quantity;
        }
      }
    } else {
      slotsNeeded = quantity;
      actualAddable = Math.min(quantity, freeSlots);
      overflowCount = Math.max(0, quantity - freeSlots);
    }

    return {
      slotsNeeded,
      actualAddable,
      overflowCount,
      isFood,
      hasExistingStack,
      willOverflow: overflowCount > 0,
    };
  }

  private evaluateCraftCore(recipe: RecipeDef): {
    isUnlocked: boolean;
    unlockStatus: CraftPreview['unlockStatus'];
    skillOk: boolean;
    currentSkill: number;
    requiredSkill: number;
    facilityRequired: string | null;
    facilityPresent: boolean;
    missingMaterials: RecipeMaterial[];
    missingTools: string[];
    freeSlots: number;
    plan: InventoryPlan;
    blockReasons: string[];
  } {
    const currentSkill = this.cb.getSkillLevel();
    const requiredSkill = recipe.requiredSkill ?? 0;
    const skillOk = currentSkill >= requiredSkill;

    const facilityRequired = recipe.requiredFacility ?? null;
    const facilityPresent = !facilityRequired || this.cb.hasFacility(facilityRequired);

    const isUnlocked = !recipe.unlockCondition || this.unlockedRecipes.has(recipe.id);
    const unlockStatus: CraftPreview['unlockStatus'] = !recipe.unlockCondition
      ? 'no_condition'
      : isUnlocked ? 'unlocked' : 'locked';

    const freeSlots = this.cb.getInventoryFreeSlots();
    const plan = this.calcInventoryPlan(recipe.result.itemId, recipe.result.quantity, freeSlots);

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
    if (plan.willOverflow) blockReasons.push(`背包已满（剩余空位: ${freeSlots}，需要: ${plan.slotsNeeded}）`);

    return {
      isUnlocked,
      unlockStatus,
      skillOk,
      currentSkill,
      requiredSkill,
      facilityRequired,
      facilityPresent,
      missingMaterials,
      missingTools,
      freeSlots,
      plan,
      blockReasons,
    };
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
        isFood: false,
        hasExistingStack: false,
        freeSlots: this.cb.getInventoryFreeSlots(),
        slotsNeeded: 0,
        willOverflow: false,
        overflowCount: 0,
        actualAddable: 0,
        unlockStatus: 'no_condition',
        blockReasons: [`未找到配方: ${recipeId}`],
        executability: 'none',
        willConsumeMaterials: false,
        materialsAtRisk: [],
        planValid: false,
        planToken: '',
        tipText: `未找到配方: ${recipeId}`,
      };
    }

    const core = this.evaluateCraftCore(recipe);
    const { plan, blockReasons } = core;

    const missingHardRequirements = !core.isUnlocked
      || core.missingMaterials.length > 0
      || core.missingTools.length > 0
      || !core.skillOk
      || !core.facilityPresent;

    let executability: CraftPreview['executability'];
    let willConsumeMaterials: boolean;
    let materialsAtRisk: RecipeMaterial[];
    let canCraft: boolean;
    let planValid: boolean;

    if (missingHardRequirements) {
      executability = 'none';
      willConsumeMaterials = false;
      materialsAtRisk = [];
      canCraft = false;
      planValid = false;
    } else if (plan.willOverflow) {
      executability = 'partial';
      willConsumeMaterials = true;
      materialsAtRisk = recipe.materials.map((m) => ({ ...m }));
      canCraft = false;
      planValid = true;
    } else {
      executability = 'full';
      willConsumeMaterials = true;
      materialsAtRisk = [];
      canCraft = true;
      planValid = true;
    }

    const planToken = generateId();

    return {
      canCraft,
      materialsToConsume: recipe.materials.map((m) => ({ ...m })),
      toolsRequired: recipe.requiredTools ?? [],
      skillRequired: core.requiredSkill,
      currentSkill: core.currentSkill,
      facilityRequired: core.facilityRequired,
      facilityPresent: core.facilityPresent,
      resultItem: { ...recipe.result },
      isFood: plan.isFood,
      hasExistingStack: plan.hasExistingStack,
      freeSlots: core.freeSlots,
      slotsNeeded: plan.slotsNeeded,
      willOverflow: plan.willOverflow,
      overflowCount: plan.overflowCount,
      actualAddable: plan.actualAddable,
      unlockStatus: core.unlockStatus,
      blockReasons,
      executability,
      willConsumeMaterials,
      materialsAtRisk,
      planValid,
      planToken,
      tipText: canCraft
        ? `可以制作: ${recipe.name}，消耗 ${recipe.materials.map((m) => `${m.itemId}×${m.quantity}`).join(', ')}，产出 ${recipe.result.name}×${recipe.result.quantity}`
        : blockReasons.join('；'),
    };
  }

  canCraft(recipeId: string): CraftCheckResult {
    const preview = this.previewCraft(recipeId);
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
        inventoryFreeSlots: preview.freeSlots,
        tipText: preview.tipText,
      };
    }

    const missingMaterials = preview.blockReasons
      .find((r) => r.startsWith('缺少材料:'));
    const missingMaterialsList = missingMaterials
      ? preview.materialsToConsume
          .map((m) => {
            const have = this.cb.getItemCount(m.itemId);
            return have < m.quantity ? { itemId: m.itemId, quantity: m.quantity - have } : null;
          })
          .filter((x): x is RecipeMaterial => x !== null)
      : [];

    const missingTools = preview.blockReasons
      .find((r) => r.startsWith('缺少工具:'));
    const missingToolsList = missingTools
      ? preview.toolsRequired.filter((t) => !this.cb.hasTool(t))
      : [];

    const missingSkill = preview.blockReasons.some((r) => r.startsWith('技能不足:'));
    const missingFacility = preview.blockReasons.some((r) => r.startsWith('缺少设施:'));
    const inventoryFull = preview.willOverflow;
    const isUnlocked = preview.unlockStatus !== 'locked';

    return {
      canCraft: preview.canCraft,
      unlocked: isUnlocked,
      missingMaterials: missingMaterialsList,
      missingTools: missingToolsList,
      missingSkill,
      currentSkill: missingSkill ? preview.currentSkill : undefined,
      requiredSkill: missingSkill ? preview.skillRequired : undefined,
      missingFacility,
      requiredFacilityName: missingFacility ? this.cb.getFacilityName(preview.facilityRequired!) ?? undefined : undefined,
      inventoryFull,
      inventoryFreeSlots: preview.freeSlots,
      tipText: preview.tipText,
    };
  }

  craft(recipeId: string, expectedPlan?: CraftPreview): CraftResult {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      return {
        success: false,
        materialsConsumed: false,
        inventoryFull: false,
        itemsActuallyAdded: 0,
        itemsOverflow: 0,
        tipText: `未找到配方: ${recipeId}`,
      };
    }

    if (expectedPlan && expectedPlan.planToken) {
      const fresh = this.previewCraft(recipeId);
      const staleReasons: string[] = [];
      if (fresh.executability !== expectedPlan.executability) staleReasons.push('可执行状态已变更');
      if (fresh.freeSlots !== expectedPlan.freeSlots) staleReasons.push(`背包空位从${expectedPlan.freeSlots}变为${fresh.freeSlots}`);
      if (fresh.currentSkill !== expectedPlan.currentSkill) staleReasons.push('技能等级已变更');
      if (fresh.facilityPresent !== expectedPlan.facilityPresent) staleReasons.push('设施状态已变更');
      if (fresh.actualAddable !== expectedPlan.actualAddable) staleReasons.push(`预计可入包数量从${expectedPlan.actualAddable}变为${fresh.actualAddable}`);
      if (staleReasons.length > 0) {
        return {
          success: false,
          materialsConsumed: false,
          inventoryFull: fresh.willOverflow,
          itemsActuallyAdded: 0,
          itemsOverflow: 0,
          tipText: `制作计划已失效: ${staleReasons.join('；')}。材料未消耗，请重新预演。`,
        };
      }
    }

    const core = this.evaluateCraftCore(recipe);
    const { plan, blockReasons } = core;

    const missingHard = !core.isUnlocked
      || core.missingMaterials.length > 0
      || core.missingTools.length > 0
      || !core.skillOk
      || !core.facilityPresent;

    if (missingHard) {
      return {
        success: false,
        materialsConsumed: false,
        inventoryFull: false,
        itemsActuallyAdded: 0,
        itemsOverflow: 0,
        tipText: blockReasons.join('；') + '。材料未消耗。',
      };
    }

    if (plan.willOverflow) {
      return {
        success: false,
        materialsConsumed: false,
        inventoryFull: true,
        itemsActuallyAdded: 0,
        itemsOverflow: plan.overflowCount,
        tipText: `背包空间不足（剩余空位: ${core.freeSlots}，需要: ${plan.slotsNeeded}）。材料未消耗，请先腾出背包。`,
      };
    }

    for (const mat of recipe.materials) {
      const have = this.cb.getItemCount(mat.itemId);
      if (have < mat.quantity) {
        return {
          success: false,
          materialsConsumed: false,
          inventoryFull: false,
          itemsActuallyAdded: 0,
          itemsOverflow: 0,
          tipText: `材料${mat.itemId}在最终校验时不足（需要${mat.quantity}，只有${have}）。材料未消耗。`,
        };
      }
    }

    for (const mat of recipe.materials) {
      const ok = this.cb.consumeItemByDefId(mat.itemId, mat.quantity);
      if (!ok) {
        return {
          success: false,
          materialsConsumed: false,
          inventoryFull: false,
          itemsActuallyAdded: 0,
          itemsOverflow: 0,
          tipText: `材料${mat.itemId}消耗失败。制作终止，已尝试回滚。`,
        };
      }
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
        tipText: `制作成功，但背包空间异常不足！获得 ${recipe.result.name} ×${itemsActuallyAdded}，有 ${overflowCount} 个物品溢出丢失。`,
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
        estimatedMinSlotsNeeded: 0,
        estimatedMaxSlotsNeeded: 0,
        estimatedMaxItems: 0,
        estimatedTotalAddable: 0,
        estimatedTotalOverflow: 0,
        potentialOverflow: false,
        tipText: `找不到采集源: ${sourceId}`,
      };
    }

    const remaining = this.sourceRespawnTimers.get(sourceId) ?? 0;
    if (remaining > 0) {
      return {
        canGather: false,
        reason: `${source.name} 已耗尽，将在 ${Math.ceil(remaining)} 小时后恢复`,
        potentialDrops: source.baseDrops.map((d) => {
          const isFood = this.cb.isFood(d.itemId);
          const hasStack = this.cb.hasExistingStack(d.itemId);
          return {
            itemId: d.itemId,
            name: d.name,
            minQty: d.minQuantity,
            maxQty: d.maxQuantity,
            chance: d.chance,
            isFood,
            hasExistingStack: hasStack,
            minSlotsNeeded: isFood && hasStack ? 0 : d.minQuantity,
            maxSlotsNeeded: isFood && hasStack ? 0 : d.maxQuantity,
            estimatedAddable: d.minQuantity,
            estimatedOverflow: 0,
          };
        }),
        freeSlots: this.cb.getInventoryFreeSlots(),
        estimatedMinSlotsNeeded: 0,
        estimatedMaxSlotsNeeded: 0,
        estimatedMaxItems: 0,
        estimatedTotalAddable: 0,
        estimatedTotalOverflow: 0,
        potentialOverflow: true,
        tipText: `${source.name} 已耗尽，将在 ${Math.ceil(remaining)} 小时后恢复。`,
      };
    }

    if (source.requiredTool && !this.cb.hasTool(source.requiredTool)) {
      return {
        canGather: false,
        reason: `需要工具 ${source.requiredTool}`,
        potentialDrops: source.baseDrops.map((d) => {
          const isFood = this.cb.isFood(d.itemId);
          const hasStack = this.cb.hasExistingStack(d.itemId);
          return {
            itemId: d.itemId,
            name: d.name,
            minQty: d.minQuantity,
            maxQty: d.maxQuantity,
            chance: d.chance,
            isFood,
            hasExistingStack: hasStack,
            minSlotsNeeded: isFood && hasStack ? 0 : d.minQuantity,
            maxSlotsNeeded: isFood && hasStack ? 0 : d.maxQuantity,
            estimatedAddable: d.minQuantity,
            estimatedOverflow: 0,
          };
        }),
        freeSlots: this.cb.getInventoryFreeSlots(),
        estimatedMinSlotsNeeded: 0,
        estimatedMaxSlotsNeeded: 0,
        estimatedMaxItems: 0,
        estimatedTotalAddable: 0,
        estimatedTotalOverflow: 0,
        potentialOverflow: false,
        tipText: `需要工具 ${source.requiredTool} 才能采集 ${source.name}。`,
      };
    }

    const baseFreeSlots = this.cb.getInventoryFreeSlots();
    let runningSlots = baseFreeSlots;

    const potentialDrops: GatherPreview['potentialDrops'] = [];
    let estimatedTotalAddable = 0;
    let estimatedTotalOverflow = 0;
    let estimatedMinSlotsNeeded = 0;
    let estimatedMaxSlotsNeeded = 0;
    let estimatedMaxItems = 0;

    for (const drop of source.baseDrops) {
      const effectiveChance = Math.min(1, drop.chance + toolBonus * 0.1);
      const isFood = this.cb.isFood(drop.itemId);
      const hasExistingStack = this.cb.hasExistingStack(drop.itemId);
      const bonusFactor = 1 + toolBonus * 0.2;
      const maxQty = Math.floor(drop.maxQuantity * bonusFactor);
      const minQty = drop.minQuantity;

      let minSlotsNeeded: number;
      let maxSlotsNeeded: number;

      if (isFood && hasExistingStack) {
        minSlotsNeeded = 0;
        maxSlotsNeeded = 0;
      } else if (isFood) {
        minSlotsNeeded = minQty > 0 ? 1 : 0;
        maxSlotsNeeded = 1;
      } else {
        minSlotsNeeded = minQty;
        maxSlotsNeeded = maxQty;
      }

      let perItemAddable = 0;
      let perItemOverflow = 0;

      if (isFood && hasExistingStack) {
        perItemAddable = maxQty;
        perItemOverflow = 0;
      } else if (isFood) {
        if (runningSlots >= 1) {
          perItemAddable = maxQty;
          perItemOverflow = 0;
          runningSlots -= 1;
        } else {
          perItemAddable = 0;
          perItemOverflow = maxQty;
        }
      } else {
        perItemAddable = Math.min(maxQty, runningSlots);
        perItemOverflow = Math.max(0, maxQty - runningSlots);
        runningSlots = Math.max(0, runningSlots - perItemAddable);
      }

      estimatedTotalAddable += perItemAddable;
      estimatedTotalOverflow += perItemOverflow;
      estimatedMinSlotsNeeded += minSlotsNeeded;
      estimatedMaxSlotsNeeded += maxSlotsNeeded;
      estimatedMaxItems += maxQty;

      potentialDrops.push({
        itemId: drop.itemId,
        name: drop.name,
        minQty,
        maxQty,
        chance: effectiveChance,
        isFood,
        hasExistingStack,
        minSlotsNeeded,
        maxSlotsNeeded,
        estimatedAddable: perItemAddable,
        estimatedOverflow: perItemOverflow,
      });
    }

    const potentialOverflow = estimatedTotalOverflow > 0;

    return {
      canGather: true,
      reason: '',
      potentialDrops,
      freeSlots: baseFreeSlots,
      estimatedMinSlotsNeeded,
      estimatedMaxSlotsNeeded,
      estimatedMaxItems,
      estimatedTotalAddable,
      estimatedTotalOverflow,
      potentialOverflow,
      tipText: potentialOverflow
        ? `背包空位有限（${baseFreeSlots}），预计最多可入包 ${estimatedTotalAddable} 件，将溢出 ${estimatedTotalOverflow} 件。`
        : `可以从${source.name}采集，预计最多可入包 ${estimatedTotalAddable} 件。`,
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

  getSnapshot(): {
    unlockedRecipes: string[];
    sourceRespawnTimers: Record<string, number>;
  } {
    return {
      unlockedRecipes: Array.from(this.unlockedRecipes),
      sourceRespawnTimers: Object.fromEntries(this.sourceRespawnTimers),
    };
  }

  loadSnapshot(snapshot: {
    unlockedRecipes: string[];
    sourceRespawnTimers: Record<string, number>;
  }): void {
    this.unlockedRecipes.clear();
    for (const id of snapshot.unlockedRecipes) {
      this.unlockedRecipes.add(id);
    }
    this.sourceRespawnTimers.clear();
    for (const [k, v] of Object.entries(snapshot.sourceRespawnTimers)) {
      this.sourceRespawnTimers.set(k, v);
    }
  }
}
