import { CharacterStatus } from './modules/CharacterStatus';
import { ResourceConsumption } from './modules/ResourceConsumption';
import { WeatherGeneration } from './modules/WeatherGeneration';
import { CraftingRecipe, CraftingCallbacks } from './modules/CraftingRecipe';
import { CampFacility } from './modules/CampFacility';
import { EventDrawing } from './modules/EventDrawing';
import { AchievementStatistics } from './modules/AchievementStatistics';
import { Timeline } from './modules/Timeline';
import { SeededRandom } from './utils';
import {
  SurvivalSDKConfig,
  ExternalCallbacks,
  Vitals,
  VitalsConfig,
  VitalsWarning,
  FoodDef,
  ToolType,
  InventoryItem,
  Inventory,
  SpoilageResult,
  WeatherState,
  DayNightCycle,
  ExtremeWeatherEvent,
  WeatherConfig,
  WeatherType,
  SeasonCalendar,
  SeasonState,
  GatherSource,
  GatherResult,
  GatherPreview,
  RecipeDef,
  CraftCheckResult,
  CraftResult,
  CraftPreview,
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
  AchievementCategory,
  AchievementCategoryPanel,
  AchievementDashboard,
  SurvivalStats,
  TipTextContext,
  RecipeMaterial,
  SaveSnapshot,
  TimelineEntry,
  TimelineEntryType,
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
  readonly timeline: Timeline;

  private rng: SeededRandom;
  private config: SurvivalSDKConfig;
  private external: ExternalCallbacks;
  private _dayCounter: number = 0;
  private _hoursInCurrentDay: number = 0;
  private _skillLevel: number = 1;
  private _lastSeasonName: string = '';

  constructor(config: SurvivalSDKConfig = {}) {
    this.config = config;
    this.rng = new SeededRandom(config.randomSeed);
    this.external = config.externalCallbacks ?? {};

    this.character = new CharacterStatus(config.vitals);
    this.resource = new ResourceConsumption(config.inventoryCapacity ?? 20, this.rng);
    this.weather = new WeatherGeneration(config.weather ?? {}, this.rng);
    this.timeline = new Timeline();

    const self = this;
    const callbacks: CraftingCallbacks = {
      getItemCount: (id) => self.resource.getItemCount(id),
      consumeItemByDefId: (id, qty) => self.resource.consumeItemByDefId(id, qty),
      hasTool: (id) => self.resource.hasItem(id),
      addItem: (id, qty) => self.resource.addItem(id, qty),
      addItemWithOverflow: (id, qty) => self.resource.addItemWithOverflow(id, qty),
      getSkillLevel: () => self.getEffectiveSkillLevel(),
      hasFacility: (type) => self.getEffectiveHasFacility(type),
      getFacilityName: (type) => {
        const facilities = self.camp.getFacilitiesByType(type as FacilityType);
        return facilities.length > 0 ? facilities[0].name : null;
      },
      getInventoryFreeSlots: () => self.getEffectiveFreeSlots(),
      isFood: (id) => self.resource.isFood(id),
      isTool: (id) => self.resource.isTool(id),
      hasExistingStack: (id) => {
        const inv = self.resource.getInventory();
        return inv.items.some((i) => i.defId === id && i.currentSpoilage !== undefined && i.currentSpoilage < 100);
      },
    };
    this.crafting = new CraftingRecipe(this.rng, callbacks);

    this.camp = new CampFacility(this.rng);
    this.event = new EventDrawing(this.rng);
    this.achievement = new AchievementStatistics();

    this._lastSeasonName = this.weather.getSeasonState().currentSeason.name;
  }

  private getEffectiveSkillLevel(): number {
    if (this.external.getSkillLevel) return this.external.getSkillLevel();
    return this._skillLevel;
  }

  private getEffectiveHasFacility(type: string): boolean {
    if (this.external.hasFacility) return this.external.hasFacility(type);
    return this.camp.hasFacilityOfType(type as FacilityType);
  }

  private getEffectiveInventoryCapacity(): number {
    if (this.external.getInventoryCapacity) return this.external.getInventoryCapacity();
    return this.resource.getInventoryCapacity();
  }

  private getEffectiveFreeSlots(): number {
    const capacity = this.getEffectiveInventoryCapacity();
    const used = this.resource.getInventoryUsed();
    return Math.max(0, capacity - used);
  }

  setSkillLevel(level: number): void {
    this._skillLevel = Math.max(1, level);
    if (this.external.setSkillLevel) {
      this.external.setSkillLevel(level);
    }
  }

  getSkillLevel(): number {
    return this.getEffectiveSkillLevel();
  }

  getInventoryCapacity(): number {
    return this.getEffectiveInventoryCapacity();
  }

  getCampWarmthBonus(): number {
    if (this.external.getCampWarmthBonus) return this.external.getCampWarmthBonus();
    return this.camp.getWarmthBonus();
  }

  getCampSafetyBonus(): number {
    if (this.external.getCampSafetyBonus) return this.external.getCampSafetyBonus();
    return this.camp.getSafetyBonus();
  }

  previewCraft(recipeId: string): CraftPreview {
    return this.crafting.previewCraft(recipeId);
  }

  previewGather(sourceId: string, toolBonus: number = 0): GatherPreview {
    return this.crafting.previewGather(sourceId, toolBonus);
  }

  craft(recipeId: string): CraftResult {
    const result = this.crafting.craft(recipeId);
    if (result.success) {
      const recipe = this.crafting.getRecipe(recipeId);
      this.timeline.record('craft', this._dayCounter, {
        recipeId,
        resultItem: recipe?.result.itemId ?? '',
        quantity: result.itemsActuallyAdded,
        overflow: result.itemsOverflow,
      }, result.tipText);

      const newAchievements = this.achievement.recordCraft(result.itemsActuallyAdded);
      result.newAchievements = newAchievements.length > 0 ? newAchievements : undefined;
    }
    return result;
  }

  gather(sourceId: string, toolBonus: number = 0): GatherResult {
    const result = this.crafting.gather(sourceId, toolBonus);
    if (result.items.length > 0) {
      this.timeline.record('gather', this._dayCounter, {
        sourceId,
        itemsGathered: result.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
        overflowCount: result.overflowItems.reduce((s, i) => s + i.quantity, 0),
      }, result.tipText);

      const totalItems = result.addedToInventory.reduce((s, i) => s + i.quantity, 0);
      const newAchievements = this.achievement.recordGather(totalItems);
      result.newAchievements = newAchievements.length > 0 ? newAchievements : undefined;
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
      this.timeline.record('event_result', this._dayCounter, {
        eventId: result.eventId,
        effects: result.effects.map((e) => e.type),
      }, result.tipText);

      const newAchievements = this.achievement.recordEventResolved();
      result.newAchievements = newAchievements.length > 0 ? newAchievements : undefined;
    }
    return result;
  }

  upgradeFacility(
    facilityId: string,
    consumeMaterials: (mats: RecipeMaterial[]) => boolean
  ): { success: boolean; facility?: FacilityDef; tipText: string; newAchievements?: AchievementDef[] } {
    const result = this.camp.upgradeFacility(facilityId, consumeMaterials);
    if (result.success) {
      this.timeline.record('facility_upgrade', this._dayCounter, {
        facilityId,
        level: result.facility?.level,
      }, result.tipText);

      const newAchievements = this.achievement.recordFacilityUpgrade();
      return { ...result, newAchievements: newAchievements.length > 0 ? newAchievements : undefined };
    }
    return result;
  }

  damageFacility(facilityId: string, damageAmount: number): { destroyed: boolean; health: number; tipText: string } {
    const result = this.camp.damageFacility(facilityId, damageAmount);
    this.timeline.record('facility_damage', this._dayCounter, {
      facilityId,
      damageAmount,
      health: result.health,
      destroyed: result.destroyed,
    }, result.tipText);
    return result;
  }

  repairFacility(facilityId: string, repairAmount: number): { success: boolean; health: number; tipText: string } {
    const result = this.camp.repairFacility(facilityId, repairAmount);
    if (result.success) {
      this.timeline.record('facility_repair', this._dayCounter, {
        facilityId,
        repairAmount,
        health: result.health,
      }, result.tipText);
    }
    return result;
  }

  tick(deltaHours: number = 1): {
    vitals: Vitals;
    warnings: VitalsWarning[];
    weather: WeatherState;
    spoilage: SpoilageResult[];
    dayAdvanced: boolean;
    seasonState: SeasonState;
    newAchievements: AchievementDef[];
  } {
    const currentWeather = this.weather.generateNextWeather(deltaHours);

    const warnings = this.character.updateVitals(deltaHours, currentWeather);

    const spoilage = this.resource.calculateSpoilage(deltaHours * 60);

    this.crafting.updateRespawnTimers(deltaHours);

    const prevSeasonName = this._lastSeasonName;

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

    const activeExtreme = this.weather.getActiveExtremeEvent();
    if (activeExtreme && currentWeather.severity >= 0.7) {
      this.timeline.record('extreme_weather', this._dayCounter, {
        type: activeExtreme.type,
        name: activeExtreme.name,
        intensity: activeExtreme.intensity,
        remaining: activeExtreme.duration,
      }, activeExtreme.tipText);
    }

    const seasonState = this.weather.getSeasonState();
    if (seasonState.currentSeason.name !== prevSeasonName) {
      this.timeline.record('season_change', this._dayCounter, {
        from: prevSeasonName,
        to: seasonState.currentSeason.name,
        dayInSeason: seasonState.dayInSeason,
      }, `季节从${prevSeasonName}变为${seasonState.currentSeason.name}`);
      this._lastSeasonName = seasonState.currentSeason.name;
    }

    const spoiledItems = spoilage.filter((s) => s.isSpoiled);
    if (spoiledItems.length > 0) {
      this.timeline.record('resource_change', this._dayCounter, {
        spoiledCount: spoiledItems.length,
      }, `${spoiledItems.length}件食物腐败变质`);
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
      seasonState,
      newAchievements,
    };
  }

  getSurvivalDays(): number {
    return this._dayCounter;
  }

  getSeasonState(): SeasonState {
    return this.weather.getSeasonState();
  }

  setSeasonCalendar(calendar: SeasonCalendar): void {
    this.weather.setCalendar(calendar);
  }

  getSeasonCalendar(): SeasonCalendar {
    return this.weather.getCalendar();
  }

  setExtremeWeatherBlacklist(blacklist: WeatherType[]): void {
    this.weather.setExtremeWeatherBlacklist(blacklist);
  }

  getExtremeWeatherBlacklist(): WeatherType[] {
    return this.weather.getExtremeWeatherBlacklist();
  }

  getTimeline(limit?: number): TimelineEntry[] {
    return this.timeline.getEntries(limit);
  }

  getTimelineByType(type: TimelineEntryType, limit?: number): TimelineEntry[] {
    return this.timeline.getEntriesByType(type, limit);
  }

  getTimelineByDayRange(startDay: number, endDay: number): TimelineEntry[] {
    return this.timeline.getEntriesByDayRange(startDay, endDay);
  }

  getRecentExtremeWeather(limit: number = 10): TimelineEntry[] {
    return this.timeline.getRecentExtremeWeather(limit);
  }

  getRecentEvents(limit: number = 10): TimelineEntry[] {
    return this.timeline.getRecentEvents(limit);
  }

  getRecentFacilityChanges(limit: number = 10): TimelineEntry[] {
    return this.timeline.getRecentFacilityChanges(limit);
  }

  getRecentResourceChanges(limit: number = 10): TimelineEntry[] {
    return this.timeline.getRecentResourceChanges(limit);
  }

  save(): SaveSnapshot {
    return {
      version: 1,
      timestamp: Date.now(),
      character: this.character.getSnapshot(),
      resource: this.resource.getSnapshot(),
      weather: this.weather.getSnapshot(),
      camp: this.camp.getSnapshot(),
      crafting: this.crafting.getSnapshot(),
      event: this.event.getSnapshot(),
      achievement: this.achievement.getSnapshot(),
      sdk: {
        dayCounter: this._dayCounter,
        hoursInCurrentDay: this._hoursInCurrentDay,
        skillLevel: this._skillLevel,
        rngState: this.rng.getState(),
      },
    };
  }

  load(snapshot: SaveSnapshot): void {
    this.character.loadSnapshot(snapshot.character);
    this.resource.loadSnapshot(snapshot.resource);
    this.weather.loadSnapshot(snapshot.weather);
    this.camp.loadSnapshot(snapshot.camp);
    this.crafting.loadSnapshot(snapshot.crafting);
    this.event.loadSnapshot(snapshot.event);
    this.achievement.loadSnapshot(snapshot.achievement);

    this._dayCounter = snapshot.sdk.dayCounter;
    this._hoursInCurrentDay = snapshot.sdk.hoursInCurrentDay;
    this._skillLevel = snapshot.sdk.skillLevel;
    this.rng.setState(snapshot.sdk.rngState);
    this._lastSeasonName = this.weather.getSeasonState().currentSeason.name;
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
    seasonState: SeasonState;
    achievementProgress: { unlocked: number; total: number; percent: number };
  } {
    return {
      vitals: this.character.getVitals(),
      weather: this.weather.getCurrentWeather(),
      dayNight: this.weather.getDayNightCycle(),
      inventory: this.resource.getInventory(),
      survivalDays: this._dayCounter,
      skillLevel: this.getEffectiveSkillLevel(),
      isAlive: this.character.isAlive(),
      campFacilities: this.camp.getFacilities(),
      activeExtremeEvent: this.weather.getActiveExtremeEvent(),
      seasonState: this.weather.getSeasonState(),
      achievementProgress: this.achievement.getTotalProgress(),
    };
  }

  getStatistics(): SurvivalStats {
    return this.achievement.getStatistics();
  }

  getAchievementProgress(): AchievementProgress[] {
    return this.achievement.getAchievementProgress();
  }

  getAchievementProgressByCategory(category: AchievementCategory): AchievementCategoryPanel {
    return this.achievement.getAchievementProgressByCategory(category);
  }

  getAchievementDashboard(): AchievementDashboard {
    return this.achievement.getDashboard();
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
    this.timeline.clear();
    this._lastSeasonName = this.weather.getSeasonState().currentSeason.name;
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
  Timeline,
};
