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

export interface WeatherConfig {
  dayLength: number;
  nightLength: number;
  baseTemperature: number;
  temperatureAmplitude: number;
  extremeWeatherChance: number;
  seasonType: 'temperate' | 'tropical' | 'arctic' | 'desert';
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
  exhausted: boolean;
  tipText: string;
}

export interface GatheredItem {
  itemId: string;
  name: string;
  quantity: number;
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
  missingMaterials: RecipeMaterial[];
  missingTools: string[];
  missingSkill: boolean;
  missingFacility: boolean;
  tipText: string;
}

export interface CraftResult {
  success: boolean;
  resultItem?: InventoryItem;
  materialsConsumed: boolean;
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

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: 'survival' | 'crafting' | 'combat' | 'exploration' | 'social';
  condition: AchievementCondition;
  reward?: AchievementReward;
  tipText: string;
}

export interface AchievementCondition {
  type: 'survival_days' | 'craft_count' | 'kill_count' | 'gather_count' | 'explore_count' | 'weather_survived' | 'facility_level' | 'event_resolved';
  value: number;
}

export interface AchievementReward {
  type: 'stat_boost' | 'recipe_unlock' | 'event_unlock' | 'title';
  value: string | number;
}

export interface SurvivalStats {
  daysSurvived: number;
  totalGatherCount: number;
  totalCraftCount: number;
  totalEventsResolved: number;
  weatherSurvived: Partial<Record<WeatherType, number>>;
  deathCount: number;
  causeOfDeath: string[];
  longestSurvival: number;
  achievementsUnlocked: string[];
}

export interface TipTextContext {
  vitals?: Vitals;
  weather?: WeatherState;
  currentEvents?: SurvivalEventType[];
  survivalDays?: number;
  inventory?: Inventory;
}

export interface SurvivalSDKConfig {
  vitals?: Partial<VitalsConfig>;
  weather?: Partial<WeatherConfig>;
  inventoryCapacity?: number;
  randomSeed?: number;
}
