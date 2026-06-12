import {
  FoodDef,
  ToolType,
  InventoryItem,
  Inventory,
  SpoilageResult,
  DurabilityResult,
  FoodCategory,
} from '../types';
import { clamp, generateId, SeededRandom } from '../utils';

export class ResourceConsumption {
  private foods: Map<string, FoodDef> = new Map();
  private tools: Map<string, ToolType> = new Map();
  private inventory: Inventory;
  private rng: SeededRandom;
  private gameMinutesElapsed: number = 0;

  constructor(inventoryCapacity: number, rng: SeededRandom) {
    this.inventory = { items: [], capacity: inventoryCapacity };
    this.rng = rng;
  }

  registerFood(food: FoodDef): void {
    this.foods.set(food.id, food);
  }

  registerTool(tool: ToolType): void {
    this.tools.set(tool.id, tool);
  }

  registerFoods(foods: FoodDef[]): void {
    foods.forEach((f) => this.foods.set(f.id, f));
  }

  registerTools(tools: ToolType[]): void {
    tools.forEach((t) => this.tools.set(t.id, t));
  }

  getFood(id: string): FoodDef | undefined {
    return this.foods.get(id);
  }

  getTool(id: string): ToolType | undefined {
    return this.tools.get(id);
  }

  getAllFoods(): FoodDef[] {
    return Array.from(this.foods.values());
  }

  getAllTools(): ToolType[] {
    return Array.from(this.tools.values());
  }

  addFoodItem(foodId: string, quantity: number): InventoryItem | null {
    const food = this.foods.get(foodId);
    if (!food) return null;

    const existing = this.inventory.items.find(
      (i) => i.defId === foodId && i.currentSpoilage !== undefined && i.currentSpoilage < 100
    );

    if (existing) {
      existing.quantity += quantity;
      return { ...existing };
    }

    if (this.inventory.items.length >= this.inventory.capacity) return null;

    const item: InventoryItem = {
      defId: foodId,
      quantity,
      instanceId: generateId(),
      acquiredAt: this.gameMinutesElapsed,
      currentSpoilage: 0,
    };
    this.inventory.items.push(item);
    return { ...item };
  }

  addToolItem(toolId: string): InventoryItem | null {
    const tool = this.tools.get(toolId);
    if (!tool) return null;
    if (this.inventory.items.length >= this.inventory.capacity) return null;

    const item: InventoryItem = {
      defId: toolId,
      quantity: 1,
      instanceId: generateId(),
      acquiredAt: this.gameMinutesElapsed,
      currentDurability: tool.maxDurability,
    };
    this.inventory.items.push(item);
    return { ...item };
  }

  addItem(defId: string, quantity: number): InventoryItem | null {
    const food = this.foods.get(defId);
    if (food) return this.addFoodItem(defId, quantity);
    const tool = this.tools.get(defId);
    if (tool) return this.addToolItem(defId);
    return null;
  }

  addItemWithOverflow(defId: string, quantity: number): { added: InventoryItem[]; overflowCount: number } {
    const food = this.foods.get(defId);
    const tool = this.tools.get(defId);

    if (!food && !tool) return { added: [], overflowCount: quantity };

    if (food) {
      const existing = this.inventory.items.find(
        (i) => i.defId === defId && i.currentSpoilage !== undefined && i.currentSpoilage < 100
      );
      if (existing) {
        existing.quantity += quantity;
        return { added: [{ ...existing }], overflowCount: 0 };
      }

      if (this.inventory.items.length < this.inventory.capacity) {
        const item = this.addFoodItem(defId, quantity);
        return item ? { added: [item], overflowCount: 0 } : { added: [], overflowCount: quantity };
      }

      return { added: [], overflowCount: quantity };
    }

    if (tool) {
      const added: InventoryItem[] = [];
      let remaining = quantity;
      while (remaining > 0 && this.inventory.items.length < this.inventory.capacity) {
        const item = this.addToolItem(defId);
        if (item) {
          added.push(item);
          remaining--;
        } else {
          break;
        }
      }
      return { added, overflowCount: remaining };
    }

    return { added: [], overflowCount: quantity };
  }

  removeItem(instanceId: string): InventoryItem | null {
    const idx = this.inventory.items.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1) return null;
    const [removed] = this.inventory.items.splice(idx, 1);
    return removed;
  }

  consumeFood(instanceId: string): { food: FoodDef; item: InventoryItem; poisoned: boolean } | null {
    const idx = this.inventory.items.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1) return null;

    const item = this.inventory.items[idx];
    const food = this.foods.get(item.defId);
    if (!food) return null;

    const poisoned = this.rng.chance(food.poisonChance);

    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      this.inventory.items.splice(idx, 1);
    }

    return { food, item: { ...item }, poisoned };
  }

  useTool(instanceId: string): { tool: ToolType; item: InventoryItem; broken: boolean } | null {
    const item = this.inventory.items.find((i) => i.instanceId === instanceId);
    if (!item) return null;

    const tool = this.tools.get(item.defId);
    if (!tool) return null;

    item.currentDurability = clamp(
      (item.currentDurability ?? tool.maxDurability) - tool.durabilityLossPerUse,
      0,
      tool.maxDurability
    );

    const broken = item.currentDurability <= 0;
    if (broken) {
      this.removeItem(instanceId);
    }

    return { tool, item: { ...item }, broken };
  }

  calculateSpoilage(deltaMinutes: number): SpoilageResult[] {
    this.gameMinutesElapsed += deltaMinutes;
    const results: SpoilageResult[] = [];

    for (const item of this.inventory.items) {
      const food = this.foods.get(item.defId);
      if (!food || item.currentSpoilage === undefined) continue;

      const previous = item.currentSpoilage;
      const spoilageIncrement = (deltaMinutes / food.baseSpoilageTime) * 100 * food.spoilageRateModifier;
      item.currentSpoilage = clamp(previous + spoilageIncrement, 0, 100);

      results.push({
        itemId: item.instanceId,
        previousSpoilage: previous,
        currentSpoilage: item.currentSpoilage,
        isSpoiled: item.currentSpoilage >= 100,
        spoilagePercent: item.currentSpoilage,
      });
    }

    return results;
  }

  getAllSpoilage(): SpoilageResult[] {
    const results: SpoilageResult[] = [];
    for (const item of this.inventory.items) {
      const food = this.foods.get(item.defId);
      if (!food || item.currentSpoilage === undefined) continue;
      results.push({
        itemId: item.instanceId,
        previousSpoilage: item.currentSpoilage,
        currentSpoilage: item.currentSpoilage,
        isSpoiled: item.currentSpoilage >= 100,
        spoilagePercent: item.currentSpoilage,
      });
    }
    return results;
  }

  getSpoiledItems(): InventoryItem[] {
    return this.inventory.items.filter((item) => {
      const food = this.foods.get(item.defId);
      return food && item.currentSpoilage !== undefined && item.currentSpoilage >= 100;
    });
  }

  removeSpoiledItems(): InventoryItem[] {
    const spoiled = this.getSpoiledItems();
    spoiled.forEach((item) => this.removeItem(item.instanceId));
    return spoiled;
  }

  getDurability(instanceId: string): DurabilityResult | null {
    const item = this.inventory.items.find((i) => i.instanceId === instanceId);
    if (!item) return null;

    const tool = this.tools.get(item.defId);
    if (!tool) return null;

    const current = item.currentDurability ?? tool.maxDurability;
    return {
      toolId: item.instanceId,
      previousDurability: current,
      currentDurability: current,
      isBroken: current <= 0,
      durabilityPercent: (current / tool.maxDurability) * 100,
    };
  }

  getInventory(): Inventory {
    return { items: this.inventory.items.map((i) => ({ ...i })), capacity: this.inventory.capacity };
  }

  hasItem(defId: string, quantity: number = 1): boolean {
    const total = this.inventory.items
      .filter((i) => i.defId === defId)
      .reduce((sum, i) => sum + i.quantity, 0);
    return total >= quantity;
  }

  consumeItemByDefId(defId: string, quantity: number): boolean {
    const available = this.getItemCount(defId);
    if (available < quantity) return false;

    let remaining = quantity;
    const items = this.inventory.items.filter((i) => i.defId === defId);

    for (const item of items) {
      if (remaining <= 0) break;
      if (item.quantity <= remaining) {
        remaining -= item.quantity;
        this.removeItem(item.instanceId);
      } else {
        item.quantity -= remaining;
        remaining = 0;
      }
    }

    return remaining <= 0;
  }

  getItemCount(defId: string): number {
    return this.inventory.items
      .filter((i) => i.defId === defId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  getFoodsByCategory(category: FoodCategory): FoodDef[] {
    return Array.from(this.foods.values()).filter((f) => f.category === category);
  }

  getInventoryCapacity(): number {
    return this.inventory.capacity;
  }

  getInventoryUsed(): number {
    return this.inventory.items.length;
  }

  getInventoryFreeSlots(): number {
    return this.inventory.capacity - this.inventory.items.length;
  }

  isFood(defId: string): boolean {
    return this.foods.has(defId);
  }

  isTool(defId: string): boolean {
    return this.tools.has(defId);
  }

  setInventoryCapacity(capacity: number): void {
    this.inventory.capacity = capacity;
  }

  getSnapshot(): { inventory: { items: InventoryItem[]; capacity: number }; gameMinutesElapsed: number } {
    return {
      inventory: {
        items: this.inventory.items.map((i) => ({ ...i })),
        capacity: this.inventory.capacity,
      },
      gameMinutesElapsed: this.gameMinutesElapsed,
    };
  }

  loadSnapshot(snapshot: { inventory: { items: InventoryItem[]; capacity: number }; gameMinutesElapsed: number }): void {
    this.inventory = {
      items: snapshot.inventory.items.map((i) => ({ ...i })),
      capacity: snapshot.inventory.capacity,
    };
    this.gameMinutesElapsed = snapshot.gameMinutesElapsed;
  }
}
