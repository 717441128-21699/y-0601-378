import {
  WeatherState,
  WeatherType,
  DayPhase,
  DayNightCycle,
  ExtremeWeatherEvent,
  WeatherEffect,
  WeatherConfig,
  ExtremeWeatherWeights,
  SeasonWeights,
  SeasonDef,
  SeasonCalendar,
  SeasonState,
} from '../types';
import { clamp, SeededRandom } from '../utils';

const DEFAULT_SEASON_PRESETS: Record<string, SeasonDef> = {
  temperate: {
    name: '温带',
    durationDays: 30,
    baseTemperature: 20,
    temperatureAmplitude: 10,
    nightTemperatureDrop: 5,
    seasonWeights: { rainChance: 0.25, snowChance: 0.05, fogChance: 0.08, windyChance: 0.07 },
    extremeWeatherChance: 0.1,
    extremeWeatherWeights: { storm: 1, blizzard: 1, heatwave: 1, cold_wave: 1 },
    extremeWeatherBlacklist: [],
  },
  tropical: {
    name: '热带',
    durationDays: 30,
    baseTemperature: 30,
    temperatureAmplitude: 6,
    nightTemperatureDrop: 3,
    seasonWeights: { rainChance: 0.35, snowChance: 0, fogChance: 0.05, windyChance: 0.05 },
    extremeWeatherChance: 0.15,
    extremeWeatherWeights: { storm: 2, blizzard: 0, heatwave: 1, cold_wave: 0 },
    extremeWeatherBlacklist: ['blizzard', 'cold_wave'],
  },
  arctic: {
    name: '寒带',
    durationDays: 30,
    baseTemperature: -10,
    temperatureAmplitude: 8,
    nightTemperatureDrop: 8,
    seasonWeights: { rainChance: 0.1, snowChance: 0.4, fogChance: 0.06, windyChance: 0.1 },
    extremeWeatherChance: 0.2,
    extremeWeatherWeights: { storm: 1, blizzard: 3, heatwave: 0, cold_wave: 2 },
    extremeWeatherBlacklist: ['heatwave'],
  },
  desert: {
    name: '沙漠',
    durationDays: 30,
    baseTemperature: 35,
    temperatureAmplitude: 15,
    nightTemperatureDrop: 12,
    seasonWeights: { rainChance: 0.05, snowChance: 0, fogChance: 0.03, windyChance: 0.12 },
    extremeWeatherChance: 0.12,
    extremeWeatherWeights: { storm: 1, blizzard: 0, heatwave: 3, cold_wave: 0 },
    extremeWeatherBlacklist: ['blizzard', 'cold_wave'],
  },
};

const DEFAULT_CALENDAR_SEASONS: SeasonDef[] = [
  {
    name: '春',
    durationDays: 15,
    baseTemperature: 15,
    temperatureAmplitude: 8,
    nightTemperatureDrop: 5,
    seasonWeights: { rainChance: 0.3, snowChance: 0.02, fogChance: 0.1, windyChance: 0.1 },
    extremeWeatherChance: 0.08,
    extremeWeatherWeights: { storm: 2, blizzard: 0, heatwave: 0, cold_wave: 1 },
    extremeWeatherBlacklist: ['blizzard', 'heatwave'],
  },
  {
    name: '夏',
    durationDays: 15,
    baseTemperature: 30,
    temperatureAmplitude: 6,
    nightTemperatureDrop: 3,
    seasonWeights: { rainChance: 0.2, snowChance: 0, fogChance: 0.03, windyChance: 0.05 },
    extremeWeatherChance: 0.12,
    extremeWeatherWeights: { storm: 1, blizzard: 0, heatwave: 2, cold_wave: 0 },
    extremeWeatherBlacklist: ['blizzard', 'cold_wave'],
  },
  {
    name: '秋',
    durationDays: 15,
    baseTemperature: 12,
    temperatureAmplitude: 10,
    nightTemperatureDrop: 7,
    seasonWeights: { rainChance: 0.25, snowChance: 0.05, fogChance: 0.12, windyChance: 0.15 },
    extremeWeatherChance: 0.1,
    extremeWeatherWeights: { storm: 1, blizzard: 1, heatwave: 0, cold_wave: 1 },
    extremeWeatherBlacklist: ['heatwave'],
  },
  {
    name: '冬',
    durationDays: 15,
    baseTemperature: -5,
    temperatureAmplitude: 6,
    nightTemperatureDrop: 10,
    seasonWeights: { rainChance: 0.08, snowChance: 0.4, fogChance: 0.06, windyChance: 0.12 },
    extremeWeatherChance: 0.15,
    extremeWeatherWeights: { storm: 1, blizzard: 3, heatwave: 0, cold_wave: 2 },
    extremeWeatherBlacklist: ['heatwave'],
  },
];

const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  dayLength: 16,
  nightLength: 8,
  baseTemperature: 20,
  temperatureAmplitude: 10,
  nightTemperatureDrop: 5,
  extremeWeatherChance: 0.1,
  extremeWeatherMinDuration: 2,
  extremeWeatherMaxDuration: 8,
  extremeWeatherWeights: { storm: 1, blizzard: 1, heatwave: 1, cold_wave: 1 },
  extremeWeatherBlacklist: [],
  seasonWeights: { rainChance: 0.25, snowChance: 0.05, fogChance: 0.08, windyChance: 0.07 },
  seasonType: 'temperate',
  tempOffset: 0,
  calendar: {
    seasons: DEFAULT_CALENDAR_SEASONS,
    startSeasonIndex: 0,
  },
};

const EXTREME_WEATHER_TEMPLATES: Record<string, { name: string; description: string; effects: WeatherEffect[]; tipText: string }> = {
  storm: {
    name: '暴风雨',
    description: '狂风暴雨席卷而来，视线模糊，行动困难。',
    effects: [
      { type: 'temperature_drop', value: 8 },
      { type: 'visibility_reduction', value: 70 },
      { type: 'speed_reduction', value: 40 },
      { type: 'stamina_drain', value: 2 },
    ],
    tipText: '暴风雨来袭！尽快寻找避难所，避免在空旷地带停留。',
  },
  blizzard: {
    name: '暴风雪',
    description: '刺骨的暴风雪笼罩大地，温度急剧下降。',
    effects: [
      { type: 'temperature_drop', value: 20 },
      { type: 'visibility_reduction', value: 90 },
      { type: 'speed_reduction', value: 60 },
      { type: 'health_damage', value: 3 },
      { type: 'stamina_drain', value: 4 },
    ],
    tipText: '暴风雪降临！没有保暖设施将致命！立刻生火取暖！',
  },
  heatwave: {
    name: '热浪',
    description: '灼热的气浪扭曲了空气，地面滚烫。',
    effects: [
      { type: 'temperature_rise', value: 15 },
      { type: 'stamina_drain', value: 3 },
      { type: 'gather_penalty', value: 50 },
    ],
    tipText: '热浪肆虐！减少户外活动，注意补充水分。',
  },
  cold_wave: {
    name: '寒潮',
    description: '寒流突然来袭，气温骤降。',
    effects: [
      { type: 'temperature_drop', value: 15 },
      { type: 'speed_reduction', value: 30 },
      { type: 'stamina_drain', value: 2 },
    ],
    tipText: '寒潮来袭！增加衣物，生火保暖，避免长时间暴露。',
  },
};

export class WeatherGeneration {
  private config: WeatherConfig;
  private currentWeather: WeatherState;
  private currentHour: number = 6;
  private totalHoursElapsed: number = 0;
  private rng: SeededRandom;
  private activeExtremeEvent: ExtremeWeatherEvent | null = null;
  private extremeEventRemaining: number = 0;

  private calendar: SeasonCalendar;
  private seasonState: SeasonState;
  private totalDaysElapsed: number = 0;
  private useCalendar: boolean;

  constructor(config: Partial<WeatherConfig>, rng: SeededRandom) {
    const preset = DEFAULT_SEASON_PRESETS[config.seasonType ?? 'temperate'];
    const resolvedSeasonWeights: SeasonWeights = {
      rainChance: config.seasonWeights?.rainChance ?? preset.seasonWeights.rainChance,
      snowChance: config.seasonWeights?.snowChance ?? preset.seasonWeights.snowChance,
      fogChance: config.seasonWeights?.fogChance ?? preset.seasonWeights.fogChance,
      windyChance: config.seasonWeights?.windyChance ?? preset.seasonWeights.windyChance,
    };

    this.config = {
      ...DEFAULT_WEATHER_CONFIG,
      ...config,
      extremeWeatherWeights: {
        ...DEFAULT_WEATHER_CONFIG.extremeWeatherWeights,
        ...(config.extremeWeatherWeights ?? {}),
      },
      extremeWeatherBlacklist: config.extremeWeatherBlacklist ?? [],
      seasonWeights: resolvedSeasonWeights,
      tempOffset: config.tempOffset ?? 0,
    };

    if (config.calendar && config.calendar.seasons.length > 0) {
      this.calendar = config.calendar;
      this.useCalendar = true;
    } else if (config.seasonType && DEFAULT_SEASON_PRESETS[config.seasonType]) {
      this.calendar = {
        seasons: [DEFAULT_SEASON_PRESETS[config.seasonType]],
        startSeasonIndex: 0,
      };
      this.useCalendar = false;
    } else {
      this.calendar = DEFAULT_WEATHER_CONFIG.calendar!;
      this.useCalendar = true;
    }

    const startIdx = this.calendar.startSeasonIndex ?? 0;
    const startSeason = this.calendar.seasons[startIdx] ?? this.calendar.seasons[0];
    this.seasonState = {
      currentSeason: startSeason,
      currentSeasonIndex: startIdx,
      dayInSeason: 0,
      totalDaysElapsed: 0,
    };

    this.rng = rng;
    this.currentWeather = {
      type: 'clear',
      temperature: this.getEffectiveBaseTemp(),
      windSpeed: 5,
      visibility: 100,
      humidity: 50,
      severity: 0,
      dayPhase: 'morning',
      hour: 6,
      season: startSeason.name,
    };
  }

  generateNextWeather(deltaHours: number): WeatherState {
    this.currentHour += deltaHours;
    this.totalHoursElapsed += deltaHours;

    const dayTotal = this.config.dayLength + this.config.nightLength;
    const daysAdvanced = Math.floor(this.totalHoursElapsed / dayTotal);
    if (daysAdvanced > this.totalDaysElapsed) {
      const newDays = daysAdvanced - this.totalDaysElapsed;
      this.totalDaysElapsed = daysAdvanced;
      this.advanceSeason(newDays);
    }

    const hourOfDay = ((this.currentHour % dayTotal) + dayTotal) % dayTotal;

    this.currentWeather.dayPhase = this.getPhase(hourOfDay);
    this.currentWeather.hour = hourOfDay;
    this.currentWeather.season = this.seasonState.currentSeason.name;

    const season = this.seasonState.currentSeason;
    const tempCycle = Math.sin((hourOfDay / dayTotal) * Math.PI * 2 - Math.PI / 2);
    let baseTemp = season.baseTemperature + tempCycle * season.temperatureAmplitude + this.config.tempOffset;

    const isNight = hourOfDay >= this.config.dayLength;
    if (isNight) {
      baseTemp -= season.nightTemperatureDrop;
    }

    this.currentWeather.temperature = baseTemp;

    if (this.activeExtremeEvent) {
      this.extremeEventRemaining -= deltaHours;
      if (this.extremeEventRemaining <= 0) {
        this.activeExtremeEvent = null;
        this.extremeEventRemaining = 0;
      } else {
        for (const effect of this.activeExtremeEvent.effects) {
          if (effect.type === 'temperature_drop') {
            this.currentWeather.temperature -= effect.value;
          } else if (effect.type === 'temperature_rise') {
            this.currentWeather.temperature += effect.value;
          } else if (effect.type === 'visibility_reduction') {
            this.currentWeather.visibility = clamp(this.currentWeather.visibility - effect.value, 0, 100);
          }
        }
      }
    } else {
      this.currentWeather.visibility = 100;
      this.rollWeatherType();
    }

    this.currentWeather.temperature = Math.round(this.currentWeather.temperature * 10) / 10;
    this.currentWeather.severity = this.getSeverity(this.currentWeather.type);

    return { ...this.currentWeather };
  }

  private advanceSeason(days: number): void {
    this.seasonState.dayInSeason += days;
    this.seasonState.totalDaysElapsed += days;

    if (!this.useCalendar && this.calendar.seasons.length === 1) return;

    while (this.seasonState.dayInSeason >= this.seasonState.currentSeason.durationDays) {
      this.seasonState.dayInSeason -= this.seasonState.currentSeason.durationDays;
      this.seasonState.currentSeasonIndex = (this.seasonState.currentSeasonIndex + 1) % this.calendar.seasons.length;
      this.seasonState.currentSeason = this.calendar.seasons[this.seasonState.currentSeasonIndex];
    }
  }

  private rollWeatherType(): void {
    const season = this.seasonState.currentSeason;
    const sw = season.seasonWeights;
    const extremeChance = season.extremeWeatherChance;
    const blacklist = new Set<WeatherType>([
      ...this.config.extremeWeatherBlacklist,
      ...season.extremeWeatherBlacklist,
    ]);

    if (extremeChance > 0 && this.rng.chance(extremeChance)) {
      const type = this.pickExtremeType(season, blacklist);
      if (type) {
        this.currentWeather.type = type;
        this.triggerExtremeWeather(type);
        return;
      }
    }

    const roll = this.rng.next();
    let cumulative = 0;

    cumulative += sw.snowChance;
    if (roll < cumulative && this.currentWeather.temperature < 2 && !blacklist.has('snow')) {
      this.currentWeather.type = 'snow';
      this.currentWeather.humidity = this.rng.nextInt(60, 85);
      this.currentWeather.windSpeed = this.rng.nextInt(5, 20);
      return;
    }

    cumulative += sw.rainChance;
    if (roll < cumulative && !blacklist.has('rain')) {
      this.currentWeather.type = this.rng.pick<WeatherType>(['rain', 'heavy_rain']);
      this.currentWeather.humidity = this.rng.nextInt(70, 95);
      this.currentWeather.windSpeed = this.rng.nextInt(5, 25);
      return;
    }

    cumulative += sw.fogChance;
    if (roll < cumulative && !blacklist.has('fog')) {
      this.currentWeather.type = 'fog';
      this.currentWeather.visibility = this.rng.nextInt(20, 50);
      this.currentWeather.humidity = this.rng.nextInt(80, 95);
      this.currentWeather.windSpeed = this.rng.nextInt(0, 5);
      return;
    }

    cumulative += sw.windyChance;
    if (roll < cumulative && !blacklist.has('windy')) {
      this.currentWeather.type = 'windy';
      this.currentWeather.windSpeed = this.rng.nextInt(30, 60);
      this.currentWeather.humidity = this.rng.nextInt(20, 50);
      return;
    }

    this.currentWeather.type = this.rng.pick<WeatherType>(['clear', 'cloudy']);
    this.currentWeather.windSpeed = this.rng.nextInt(0, 15);
    this.currentWeather.humidity = this.rng.nextInt(30, 60);
  }

  private pickExtremeType(season: SeasonDef, blacklist: Set<WeatherType>): WeatherType | null {
    const weights = season.extremeWeatherWeights;
    const entries: { type: WeatherType; weight: number }[] = ([
      { type: 'storm' as WeatherType, weight: weights.storm ?? 0 },
      { type: 'blizzard' as WeatherType, weight: weights.blizzard ?? 0 },
      { type: 'heatwave' as WeatherType, weight: weights.heatwave ?? 0 },
      { type: 'cold_wave' as WeatherType, weight: weights.cold_wave ?? 0 },
    ] as const).filter(
      (e): e is { type: WeatherType; weight: number } => e.weight > 0 && !blacklist.has(e.type)
    );

    if (entries.length === 0) return null;

    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    let roll = this.rng.next() * totalWeight;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.type;
    }
    return entries[entries.length - 1].type;
  }

  triggerExtremeWeather(type: WeatherType): ExtremeWeatherEvent {
    const template = EXTREME_WEATHER_TEMPLATES[type];
    if (!template) {
      return { type, name: type, description: '', duration: 0, intensity: 0, effects: [], tipText: '' };
    }

    const intensity = this.rng.nextFloat(0.5, 1.0);
    const minDuration = this.config.extremeWeatherMinDuration;
    const maxDuration = this.config.extremeWeatherMaxDuration;
    const duration = this.rng.nextFloat(minDuration, Math.max(minDuration, maxDuration));

    const event: ExtremeWeatherEvent = {
      type,
      name: template.name,
      description: template.description,
      duration,
      intensity,
      effects: template.effects.map((e) => ({ ...e, value: Math.round(e.value * intensity) })),
      tipText: template.tipText,
    };

    this.activeExtremeEvent = event;
    this.extremeEventRemaining = duration;
    this.currentWeather.type = type;

    return { ...event };
  }

  getSeasonState(): SeasonState {
    return {
      currentSeason: { ...this.seasonState.currentSeason },
      currentSeasonIndex: this.seasonState.currentSeasonIndex,
      dayInSeason: this.seasonState.dayInSeason,
      totalDaysElapsed: this.seasonState.totalDaysElapsed,
    };
  }

  setCalendar(calendar: SeasonCalendar): void {
    this.calendar = calendar;
    this.useCalendar = calendar.seasons.length > 1;
    const startIdx = calendar.startSeasonIndex ?? 0;
    this.seasonState = {
      currentSeason: calendar.seasons[startIdx] ?? calendar.seasons[0],
      currentSeasonIndex: startIdx,
      dayInSeason: 0,
      totalDaysElapsed: this.seasonState.totalDaysElapsed,
    };
  }

  getCalendar(): SeasonCalendar {
    return {
      seasons: this.calendar.seasons.map((s) => ({ ...s })),
      startSeasonIndex: this.calendar.startSeasonIndex,
    };
  }

  setExtremeWeatherBlacklist(blacklist: WeatherType[]): void {
    this.config.extremeWeatherBlacklist = [...blacklist];
  }

  getExtremeWeatherBlacklist(): WeatherType[] {
    return [...this.config.extremeWeatherBlacklist];
  }

  updateConfig(partial: Partial<WeatherConfig>): void {
    if (partial.extremeWeatherWeights) {
      this.config.extremeWeatherWeights = { ...this.config.extremeWeatherWeights, ...partial.extremeWeatherWeights };
    }
    if (partial.seasonWeights) {
      this.config.seasonWeights = { ...this.config.seasonWeights, ...partial.seasonWeights };
    }
    if (partial.extremeWeatherBlacklist) {
      this.config.extremeWeatherBlacklist = [...partial.extremeWeatherBlacklist];
    }
    if (partial.calendar) {
      this.setCalendar(partial.calendar);
    }
    const { extremeWeatherWeights: _ew, seasonWeights: _sw, extremeWeatherBlacklist: _eb, calendar: _cal, ...rest } = partial;
    Object.assign(this.config, rest);
  }

  getConfig(): WeatherConfig {
    return { ...this.config };
  }

  getDayNightCycle(): DayNightCycle {
    const dayTotal = this.config.dayLength + this.config.nightLength;
    const hourOfDay = ((this.currentHour % dayTotal) + dayTotal) % dayTotal;
    const isNight = this.isNightTime(hourOfDay);

    return {
      currentPhase: this.getPhase(hourOfDay),
      hour: hourOfDay,
      dayLength: this.config.dayLength,
      nightLength: this.config.nightLength,
      isNight,
      lightLevel: isNight ? this.getNightLightLevel(hourOfDay) : this.getDayLightLevel(hourOfDay),
    };
  }

  isNightTime(hour?: number): boolean {
    const dayTotal = this.config.dayLength + this.config.nightLength;
    const h = hour ?? ((this.currentHour % dayTotal) + dayTotal) % dayTotal;
    return h >= this.config.dayLength;
  }

  getCurrentWeather(): WeatherState {
    return { ...this.currentWeather };
  }

  getActiveExtremeEvent(): ExtremeWeatherEvent | null {
    return this.activeExtremeEvent ? { ...this.activeExtremeEvent } : null;
  }

  getHoursElapsed(): number {
    return this.totalHoursElapsed;
  }

  setHour(hour: number): void {
    this.currentHour = hour;
  }

  private getEffectiveBaseTemp(): number {
    return this.seasonState.currentSeason.baseTemperature + this.config.tempOffset;
  }

  private getPhase(hour: number): DayPhase {
    const dayLen = this.config.dayLength;
    if (hour < 1) return 'dawn';
    if (hour < dayLen * 0.3) return 'morning';
    if (hour < dayLen * 0.5) return 'noon';
    if (hour < dayLen * 0.75) return 'afternoon';
    if (hour < dayLen) return 'dusk';
    if (hour < dayLen + this.config.nightLength * 0.5) return 'night';
    return 'midnight';
  }

  private getDayLightLevel(hour: number): number {
    const dayLen = this.config.dayLength;
    if (hour < 1 || hour > dayLen - 1) return 50;
    if (hour < dayLen * 0.5) return 70 + (hour / (dayLen * 0.5)) * 30;
    return 100 - ((hour - dayLen * 0.5) / (dayLen * 0.5)) * 30;
  }

  private getNightLightLevel(hour: number): number {
    const nightStart = this.config.dayLength;
    const nightProgress = (hour - nightStart) / this.config.nightLength;
    if (nightProgress < 0.3 || nightProgress > 0.8) return 15;
    return 5;
  }

  private getSeverity(type: WeatherType): number {
    const map: Record<WeatherType, number> = {
      clear: 0, cloudy: 0.1, fog: 0.2, windy: 0.2,
      rain: 0.3, heavy_rain: 0.5, snow: 0.3,
      storm: 0.8, blizzard: 0.9, heatwave: 0.7, cold_wave: 0.6,
    };
    return map[type] ?? 0;
  }
}
