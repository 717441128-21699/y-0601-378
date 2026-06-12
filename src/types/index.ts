export interface Vitals {
  hunger: number;
  thirst: number;
  bodyTemp: number;
  health: number;
  stamina: number;
}

export interface VitalsConfig {
  hungerDecayRate: number;
  thirstDecayRate: number;
  tempDecayRate: number;
  staminaRegenRate: number;
  criticalHungerThreshold: number;
  criticalThirstThreshold: number;
  criticalTempLow: number;
  criticalTempHigh: number;
  healthDecayOnCritical: number;
  maxHunger: number;
  maxThirst: number;
  maxHealth: number;
  maxStamina: number;
  minTemp: number;
  maxTemp: number;
}

export interface VitalsWarning {
  type: 'hunger' | 'thirst' | 'temperature' | 'health' | 'stamina';
  severity: 'low' | 'medium' | 'critical';
  message: string;
}

export type FoodCategory = 'meat' | 'vegetable' | 'fruit' | 'grain' | 'drink' | 'medicine' | 'other';

export interface FoodDef {
  id: string;
  name: string;
  category: FoodCategory;
  hungerRestore: number;
  thirstRestore: number;
  healthRestore: number;
  baseSpoilageTime: number;
  spoilageRateModifier: number;
  poisonChance: number;
  poisonDamage: number;
  temperatureEffect: number;
}

export interface ToolType {
  id: string;
  name: string;
  maxDurability: number;
  durabilityLossPerUse: number;
  efficiency: number;
  gatherBonus: number;
  craftingBonus: number;
}

export interface InventoryItem {
  defId: string;
  quantity: number;
  instanceId: string;
  acquiredAt: number;
  currentDurability?: number;
  currentSpoilage?: number;
}

export interface Inventory {
  items: InventoryItem[];
  capacity: number;
}

export interface SpoilageResult {
  itemId: string;
  previousSpoilage: number;
  currentSpoilage: number;
  isSpoiled: boolean;
  spoilagePercent: number;
}

export interface DurabilityResult {
  toolId: string;
  previousDurability: number;
  currentDurability: number;
  isBroken: boolean;
  durabilityPercent: number;
}

export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'heavy_rain' | 'storm' | 'snow' | 'blizzard' | 'heatwave' | 'cold_wave' | 'fog' | 'windy';

export type DayPhase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night' | 'midnight';

export interface WeatherState {
  type: WeatherType;
  temperature: number;
  windSpeed: number;
  visibility: number;
  humidity: number;
  severity: number;
  dayPhase: DayPhase;
  hour: number;
  season?: string;
}

export interface DayNightCycle {
  currentPhase: DayPhase;
  hour: number;
  dayLength: number;
  nightLength: number;
  isNight: boolean;
  lightLevel: number;
}

export interface ExtremeWeatherEvent {
  type: WeatherType;
  name: string;
  description: string;
  duration: number;
  intensity: number;
  effects: WeatherEffect[];
  tipText: string;
}

export interface WeatherEffect {
  type: 'temperature_drop' | 'temperature_rise' | 'visibility_reduction' | 'stamina_drain' | 'health_damage' | 'speed_reduction' | 'gather_penalty';
  value: number;
}

export interface ExtremeWeatherWeights {
  storm?: number;
  blizzard?: number;
  heatwave?: number;
  cold_wave?: number;
}

export interface SeasonWeights {
  rainChance: number;
  snowChance: number;
  fogChance: number;
  windyChance: number;
}

export interface SeasonDef {
  name: string;
  durationDays: number;
  baseTemperature: number;
  temperatureAmplitude: number;
  nightTemperatureDrop: number;
  seasonWeights: SeasonWeights;
  extremeWeatherChance: number;
  extremeWeatherWeights: ExtremeWeatherWeights;
  extremeWeatherBlacklist: WeatherType[];
}

export interface SeasonCalendar {
  seasons: SeasonDef[];
  startSeasonIndex?: number;
}

export interface SeasonState {
  currentSeason: SeasonDef;
  currentSeasonIndex: number;
  dayInSeason: number;
  totalDaysElapsed: number;
}

export interface WeatherConfig {
  dayLength: number;
  nightLength: number;
  baseTemperature: number;
  temperatureAmplitude: number;
  nightTemperatureDrop: number;
  extremeWeatherChance: number;
  extremeWeatherMinDuration: number;
  extremeWeatherMaxDuration: number;
  extremeWeatherWeights: ExtremeWeatherWeights;
  extremeWeatherBlacklist: WeatherType[];
  seasonWeights: SeasonWeights;
  seasonType: 'temperate' | 'tropical' | 'arctic' | 'desert';
  tempOffset: number;
  calendar?: SeasonCalendar;
}

export interface GatherSource {
  id: string;
  name: string;
  baseDrops: GatherDrop[];
  respawnTime: number;
  requiredTool?: string;
  skillRequirement?: number;
}

export interface GatherDrop {
  itemId: string;
  name: string;
  minQuantity: number;
  maxQuantity: number;
  chance: number;
}

export interface GatherResult {
  sourceId: string;
  items: GatheredItem[];
  addedToInventory: GatheredItem[];
  overflowItems: GatheredItem[];
  exhausted: boolean;
  tipText: string;
  newAchievements?: AchievementDef[];
}

export interface GatheredItem {
  itemId: string;
  name: string;
  quantity: number;
}

export interface GatherPreview {
  canGather: boolean;
  reason: string;
  potentialDrops: { itemId: string; name: string; minQty: number; maxQty: number; chance: number; isFood: boolean }[];
  freeSlots: number;
  estimatedMinSlotsNeeded: number;
  estimatedMaxSlotsNeeded: number;
  estimatedMaxItems: number;
  potentialOverflow: boolean;
  tipText: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  description: string;
  category: 'tool' | 'shelter' | 'consumable' | 'weapon' | 'armor' | 'misc';
  materials: RecipeMaterial[];
  requiredTools?: string[];
  requiredSkill?: number;
  requiredFacility?: string;
  craftTime: number;
  result: RecipeResult;
  unlockCondition?: string;
}

export interface RecipeMaterial {
  itemId: string;
  quantity: number;
}

export interface RecipeResult {
  itemId: string;
  name: string;
  quantity: number;
}

export interface CraftCheckResult {
  canCraft: boolean;
  unlocked: boolean;
  missingMaterials: RecipeMaterial[];
  missingTools: string[];
  missingSkill: boolean;
  currentSkill?: number;
  requiredSkill?: number;
  missingFacility: boolean;
  requiredFacilityName?: string;
  inventoryFull: boolean;
  inventoryFreeSlots: number;
  tipText: string;
}

export interface CraftResult {
  success: boolean;
  resultItem?: InventoryItem;
  materialsConsumed: boolean;
  inventoryFull: boolean;
  itemsActuallyAdded: number;
  itemsOverflow: number;
  tipText: string;
  newAchievements?: AchievementDef[];
}

export interface CraftPreview {
  canCraft: boolean;
  materialsToConsume: RecipeMaterial[];
  toolsRequired: string[];
  skillRequired: number;
  currentSkill: number;
  facilityRequired: string | null;
  facilityPresent: boolean;
  resultItem: { itemId: string; name: string; quantity: number };
  isFood: boolean;
  hasExistingStack: boolean;
  freeSlots: number;
  slotsNeeded: number;
  willOverflow: boolean;
  overflowCount: number;
  actualAddable: number;
  unlockStatus: 'unlocked' | 'locked' | 'no_condition';
  blockReasons: string[];
  tipText: string;
}

export type FacilityType = 'shelter' | 'fire' | 'storage' | 'workbench' | 'farm' | 'well' | 'wall' | 'trap' | 'bed' | 'watchtower';

export interface FacilityDef {
  id: string;
  name: string;
  type: FacilityType;
  level: number;
  maxLevel: number;
  safetyBonus: number;
  warmthBonus: number;
  storageBonus: number;
  craftBonus: number;
  upgradeMaterials: RecipeMaterial[];
  effects: FacilityEffect[];
}

export interface FacilityEffect {
  type: 'warmth' | 'safety' | 'storage' | 'craft_speed' | 'gather_bonus' | 'health_regen' | 'stamina_regen';
  value: number;
}

export interface SafetyReport {
  shelterId: string;
  overallSafety: number;
  weatherProtection: number;
  raidDefense: number;
  wildlifeDefense: number;
  fireSafety: number;
  issues: SafetyIssue[];
  tipText: string;
}

export interface SafetyIssue {
  type: 'weather_exposure' | 'weak_walls' | 'no_fire' | 'no_watchtower' | 'structural_damage';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export type SurvivalEventType = 'injury' | 'poisoning' | 'lost' | 'raid' | 'rescue' | 'wildlife_attack' | 'disease' | 'discovery' | 'weather_hazard' | 'resource_find';

export type EventSeverity = 'minor' | 'moderate' | 'major' | 'critical';

export interface SurvivalEvent {
  id: string;
  type: SurvivalEventType;
  name: string;
  description: string;
  severity: EventSeverity;
  probability: number;
  conditions: EventCondition[];
  effects: EventEffect[];
  choices?: EventChoice[];
  tipText: string;
}

export interface EventCondition {
  type: 'min_day' | 'max_day' | 'weather' | 'health_below' | 'has_item' | 'no_item' | 'location' | 'facility_level';
  value: string | number;
}

export interface EventEffect {
  type: 'health_change' | 'hunger_change' | 'thirst_change' | 'temp_change' | 'stamina_change' | 'item_gain' | 'item_loss' | 'facility_damage' | 'teleport' | 'status_effect';
  value: number | string;
}

export interface EventChoice {
  id: string;
  text: string;
  effects: EventEffect[];
  successChance: number;
  successEffects: EventEffect[];
  failureEffects: EventEffect[];
}

export interface EventResult {
  eventId: string;
  triggered: boolean;
  chosenChoice?: string;
  effects: EventEffect[];
  tipText: string;
  newAchievements?: AchievementDef[];
}

export interface InjuryResult {
  type: 'cut' | 'burn' | 'fracture' | 'sprain' | 'bruise' | 'frostbite';
  severity: EventSeverity;
  healthLoss: number;
  staminaPenalty: number;
  speedPenalty: number;
  healingTime: number;
  tipText: string;
}

export interface PoisoningResult {
  source: string;
  severity: EventSeverity;
  healthLossPerTick: number;
  duration: number;
  staminaPenalty: number;
  tipText: string;
}

export interface LostResult {
  direction: string;
  distanceFromCamp: number;
  staminaDrain: number;
  findWayChance: number;
  tipText: string;
}

export interface RaidResult {
  raiders: number;
  raidPower: number;
  defensePower: number;
  success: boolean;
  losses: RaidLoss[];
  tipText: string;
}

export interface RaidLoss {
  type: 'health' | 'item' | 'facility';
  value: number | string;
  description: string;
}

export interface RescueResult {
  rescuedBy: string;
  healthRestored: number;
  itemsReceived: GatheredItem[];
  tipText: string;
}

export type AchievementCategory = 'survival' | 'crafting' | 'combat' | 'exploration' | 'social';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  condition: AchievementCondition;
  reward?: AchievementReward;
  tipText: string;
}

export interface AchievementCondition {
  type: 'survival_days' | 'craft_count' | 'kill_count' | 'gather_count' | 'explore_count' | 'weather_survived' | 'facility_level' | 'facility_upgrade' | 'event_resolved';
  value: number;
}

export interface AchievementReward {
  type: 'stat_boost' | 'recipe_unlock' | 'event_unlock' | 'title';
  value: string | number;
}

export interface AchievementProgress {
  id: string;
  name: string;
  category: AchievementCategory;
  current: number;
  target: number;
  percent: number;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface AchievementCategoryPanel {
  category: AchievementCategory;
  achievements: AchievementProgress[];
  unlocked: number;
  total: number;
  percent: number;
}

export interface AchievementDashboard {
  totalProgress: { unlocked: number; total: number; percent: number };
  categoryPanels: AchievementCategoryPanel[];
  recentlyUnlocked: RecentlyUnlockedAchievement[];
}

export interface RecentlyUnlockedAchievement {
  achievement: AchievementDef;
  unlockedAt: number;
}

export interface SurvivalStats {
  daysSurvived: number;
  totalGatherCount: number;
  totalCraftCount: number;
  totalEventsResolved: number;
  totalFacilityUpgrades: number;
  weatherSurvived: Partial<Record<WeatherType, number>>;
  deathCount: number;
  causeOfDeath: string[];
  longestSurvival: number;
  achievementsUnlocked: string[];
  recentlyUnlocked: RecentlyUnlockedAchievement[];
}

export interface TipTextContext {
  vitals?: Vitals;
  weather?: WeatherState;
  currentEvents?: SurvivalEventType[];
  survivalDays?: number;
  inventory?: Inventory;
}

export interface ExternalCallbacks {
  getSkillLevel?: () => number;
  setSkillLevel?: (level: number) => void;
  hasFacility?: (facilityType: string) => boolean;
  getFacilityLevel?: (facilityType: string) => number;
  getCampWarmthBonus?: () => number;
  getCampSafetyBonus?: () => number;
  getInventoryCapacity?: () => number;
}

export interface SurvivalSDKConfig {
  vitals?: Partial<VitalsConfig>;
  weather?: Partial<WeatherConfig>;
  inventoryCapacity?: number;
  randomSeed?: number;
  externalCallbacks?: ExternalCallbacks;
}

export type TimelineEntryType =
  | 'extreme_weather'
  | 'event_result'
  | 'facility_upgrade'
  | 'facility_damage'
  | 'facility_repair'
  | 'resource_change'
  | 'season_change'
  | 'craft'
  | 'gather';

export interface TimelineEntry {
  type: TimelineEntryType;
  timestamp: number;
  day: number;
  data: Record<string, unknown>;
  tipText: string;
}

export interface SaveSnapshot {
  version: number;
  timestamp: number;
  character: { vitals: Vitals };
  resource: {
    inventory: { items: InventoryItem[]; capacity: number };
    gameMinutesElapsed: number;
  };
  weather: {
    currentWeather: WeatherState;
    currentHour: number;
    totalHoursElapsed: number;
    activeExtremeEvent: ExtremeWeatherEvent | null;
    extremeEventRemaining: number;
    calendar: SeasonCalendar;
    seasonState: SeasonState;
    totalDaysElapsed: number;
    useCalendar: boolean;
  };
  camp: {
    facilities: { id: string; def: FacilityDef; health: number }[];
  };
  crafting: {
    unlockedRecipes: string[];
    sourceRespawnTimers: Record<string, number>;
  };
  event: {
    eventHistory: EventResult[];
    activeEffects: [string, { effect: EventEffect; remainingTicks: number }][];
  };
  achievement: {
    stats: SurvivalStats;
    unlockedAchievements: [string, number][];
  };
  sdk: {
    dayCounter: number;
    hoursInCurrentDay: number;
    skillLevel: number;
    rngState: number;
  };
}
