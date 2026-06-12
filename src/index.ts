import { CharacterStatus } from './modules/CharacterStatus';
import { ResourceConsumption } from './modules/ResourceConsumption';
import { WeatherGeneration } from './modules/WeatherGeneration';
import { CraftingRecipe } from './modules/CraftingRecipe';
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
  SurvivalStats,
  TipTextContext,
  FoodCategory,
  RecipeMaterial,
} from './types';

export * from './types';

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

  constructor(config: SurvivalSDKConfig = {}) {
    this.config = config;
    this.rng = new SeededRandom(config.randomSeed);

    this.character = new CharacterStatus(config.vitals);
    this.resource = new ResourceConsumption(config.inventoryCapacity ?? 20, this.rng);
    this.weather = new WeatherGeneration(config.weather ?? {}, this.rng);
    this.crafting = new CraftingRecipe(this.rng, {
      getItemCount: (id) => this.resource.getItemCount(id),
      consumeItemByDefId: (id, qty) => this.resource.consumeItemByDefId(id, qty),
      hasTool: (id) => this.resource.hasItem(id),
      addCraftedItem: (id, qty) => this.resource.addItem(id, qty),
    });
    this.camp = new CampFacility(this.rng);
    this.event = new EventDrawing(this.rng);
    this.achievement = new AchievementStatistics();
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

    const newAchievements = dayAdvanced ? this.achievement.checkMilestones() : [];

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
    isAlive: boolean;
    campFacilities: FacilityDef[];
    activeExtremeEvent: ExtremeWeatherEvent | null;
  } {
    return {
      vitals: this.character.getVitals(),
      weather: this.weather.getCurrentWeather(),
      dayNight: this.weather.getDayNightCycle(),
      inventory: this.resource.getInventory(),
      survivalDays: this._dayCounter,
      isAlive: this.character.isAlive(),
      campFacilities: this.camp.getFacilities(),
      activeExtremeEvent: this.weather.getActiveExtremeEvent(),
    };
  }

  reset(): void {
    this.character.reset();
    this._dayCounter = 0;
    this._hoursInCurrentDay = 0;
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
