import { CharacterStatus } from './modules/CharacterStatus';
import { ResourceConsumption } from './modules/ResourceConsumption';
import { WeatherGeneration } from './modules/WeatherGeneration';
import { CraftingRecipe, CraftingCallbacks } from './modules/CraftingRecipe';
import { CampFacility } from './modules/CampFacility';
import { EventDrawing } from './modules/EventDrawing';
import { AchievementStatistics } from './modules/AchievementStatistics';
import { SeededRandom } from './utils';
import {
  SurvivalSDKConfig,
  Vitals,
  VitalsConfig,
  VitalsWarning,
  FoodDef,
  ToolType,
  InventoryItem,
  Inventory,
  SpoilageResult,
  DurabilityResult,
  WeatherState,
  DayNightCycle,
  ExtremeWeatherEvent,
  WeatherConfig,
  WeatherType,
  GatherSource,
  GatherResult,
  RecipeDef,
  CraftCheckResult,
  CraftResult,
  FacilityDef,
  FacilityType,
  FacilityEffect,
  SafetyReport,
  SurvivalEvent,
  SurvivalEventType,
  EventResult,
  InjuryResult,
  PoisoningResult,
  LostResult,
  RaidResult,
  RescueResult,
  EventSeverity,
  AchievementDef,
  AchievementProgress,
  SurvivalStats,
  TipTextContext,
  FoodCategory,
  RecipeMaterial,
  AchievementCondition,
} from './types';

export * from './types';
export { CraftingCallbacks } from './modules/CraftingRecipe';

export class SurvivalSDK {
  readonly character: CharacterStatus;
  readonly resource: ResourceConsumption;
  readonly weather: WeatherGeneration;
  readonly crafting: CraftingRecipe;
  readonly camp: CampFacility;
  readonly event: EventDrawing;
  readonly achievement: AchievementStatistics;

  private rng: SeededRandom;
  private config: SurvivalSDKConfig;
  private _dayCounter: number = 0;
  private _hoursInCurrentDay: number = 0;
  private _skillLevel: number = 1;

  constructor(config: SurvivalSDKConfig = {}) {
    this.config = config;
    this.rng = new SeededRandom(config.randomSeed);

    this.character = new CharacterStatus(config.vitals);
    this.resource = new ResourceConsumption(config.inventoryCapacity ?? 20, this.rng);
    this.weather = new WeatherGeneration(config.weather ?? {}, this.rng);

    const self = this;
    const callbacks: CraftingCallbacks = {
      getItemCount: (id) => self.resource.getItemCount(id),
      consumeItemByDefId: (id, qty) => self.resource.consumeItemByDefId(id, qty),
      hasTool: (id) => self.resource.hasItem(id),
      addItem: (id, qty) => self.resource.addItem(id, qty),
      addItemWithOverflow: (id, qty) => self.resource.addItemWithOverflow(id, qty),
      getSkillLevel: () => self._skillLevel,
      hasFacility: (type) => self.camp.hasFacilityOfType(type as FacilityType),
      getFacilityName: (type) => {
        const facilities = self.camp.getFacilitiesByType(type as FacilityType);
        return facilities.length > 0 ? facilities[0].name : null;
      },
      getInventoryFreeSlots: () => self.resource.getInventoryFreeSlots(),
    };
    this.crafting = new CraftingRecipe(this.rng, callbacks);

    this.camp = new CampFacility(this.rng);
    this.event = new EventDrawing(this.rng);
    this.achievement = new AchievementStatistics();
  }

  setSkillLevel(level: number): void {
    this._skillLevel = Math.max(1, level);
  }

  getSkillLevel(): number {
    return this._skillLevel;
  }

  craft(recipeId: string): CraftResult {
    const result = this.crafting.craft(recipeId);
    if (result.success) {
      this.achievement.recordCraft(result.itemsActuallyAdded);
    }
    return result;
  }

  gather(sourceId: string, toolBonus: number = 0): GatherResult {
    const result = this.crafting.gather(sourceId, toolBonus);
    if (result.addedToInventory.length > 0) {
      const totalItems = result.addedToInventory.reduce((s, i) => s + i.quantity, 0);
      this.achievement.recordGather(totalItems);
    }
    return result;
  }

  drawEvent(
    context: {
      survivalDays: number;
      vitals?: Vitals;
      weather?: WeatherState;
      hasItem?: (id: string) => boolean;
      facilityLevel?: (id: string) => number;
    },
    typeFilter?: SurvivalEventType
  ): EventResult | null {
    const result = this.event.drawEvent(context, typeFilter);
    if (result && result.triggered) {
      this.achievement.recordEventResolved();
    }
    return result;
  }

  upgradeFacility(
    facilityId: string,
    consumeMaterials: (mats: RecipeMaterial[]) => boolean
  ): { success: boolean; facility?: FacilityDef; tipText: string } {
    const result = this.camp.upgradeFacility(facilityId, consumeMaterials);
    if (result.success) {
      this.achievement.recordFacilityUpgrade();
    }
    return result;
  }

  tick(deltaHours: number = 1): {
    vitals: Vitals;
    warnings: VitalsWarning[];
    weather: WeatherState;
    spoilage: SpoilageResult[];
    dayAdvanced: boolean;
    newAchievements: AchievementDef[];
  } {
    const currentWeather = this.weather.generateNextWeather(deltaHours);

    const warnings = this.character.updateVitals(deltaHours, currentWeather);

    const spoilage = this.resource.calculateSpoilage(deltaHours * 60);

    this.crafting.updateRespawnTimers(deltaHours);

    this._hoursInCurrentDay += deltaHours;
    let dayAdvanced = false;
    const dayTotal = (this.config.weather?.dayLength ?? 16) + (this.config.weather?.nightLength ?? 8);
    if (this._hoursInCurrentDay >= dayTotal) {
      this._hoursInCurrentDay -= dayTotal;
      this._dayCounter += 1;
      dayAdvanced = true;
      this.achievement.recordSurvivalDay();
    }

    if (currentWeather.severity >= 0.5) {
      this.achievement.recordWeatherSurvived(currentWeather.type);
    }

    const newAchievements = this.achievement.checkMilestones();

    if (!this.character.isAlive()) {
      const cause = this.character.getCauseOfDeath();
      if (cause) this.achievement.recordDeath(cause);
    }

    return {
      vitals: this.character.getVitals(),
      warnings,
      weather: currentWeather,
      spoilage,
      dayAdvanced,
      newAchievements,
    };
  }

  getSurvivalDays(): number {
    return this._dayCounter;
  }

  getTipText(): string {
    return this.achievement.getTipText({
      vitals: this.character.getVitals(),
      weather: this.weather.getCurrentWeather(),
      survivalDays: this._dayCounter,
      inventory: this.resource.getInventory(),
    });
  }

  getStatusSummary(): {
    vitals: Vitals;
    weather: WeatherState;
    dayNight: DayNightCycle;
    inventory: Inventory;
    survivalDays: number;
    skillLevel: number;
    isAlive: boolean;
    campFacilities: FacilityDef[];
    activeExtremeEvent: ExtremeWeatherEvent | null;
    achievementProgress: { unlocked: number; total: number; percent: number };
  } {
    return {
      vitals: this.character.getVitals(),
      weather: this.weather.getCurrentWeather(),
      dayNight: this.weather.getDayNightCycle(),
      inventory: this.resource.getInventory(),
      survivalDays: this._dayCounter,
      skillLevel: this._skillLevel,
      isAlive: this.character.isAlive(),
      campFacilities: this.camp.getFacilities(),
      activeExtremeEvent: this.weather.getActiveExtremeEvent(),
      achievementProgress: this.achievement.getTotalProgress(),
    };
  }

  getStatistics(): SurvivalStats {
    return this.achievement.getStatistics();
  }

  getAchievementProgress(): AchievementProgress[] {
    return this.achievement.getAchievementProgress();
  }

  getRecentlyUnlockedAchievements(limit: number = 5) {
    return this.achievement.getRecentlyUnlocked(limit);
  }

  reset(): void {
    this.character.reset();
    this._dayCounter = 0;
    this._hoursInCurrentDay = 0;
    this._skillLevel = 1;
    this.achievement.resetStats();
    this.event.clearHistory();
    this.event.clearActiveEffects();
  }
}

export function createSurvivalSDK(config?: SurvivalSDKConfig): SurvivalSDK {
  return new SurvivalSDK(config);
}

export {
  CharacterStatus,
  ResourceConsumption,
  WeatherGeneration,
  CraftingRecipe,
  CampFacility,
  EventDrawing,
  AchievementStatistics,
};
