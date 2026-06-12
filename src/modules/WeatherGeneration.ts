import {
  WeatherState,
  WeatherType,
  DayPhase,
  DayNightCycle,
  ExtremeWeatherEvent,
  WeatherEffect,
  WeatherConfig,
} from '../types';
import { clamp, SeededRandom } from '../utils';

const DEFAULT_WEATHER_CONFIG: WeatherConfig = {
  dayLength: 16,
  nightLength: 8,
  baseTemperature: 20,
  temperatureAmplitude: 10,
  extremeWeatherChance: 0.1,
  seasonType: 'temperate',
};

const WEATHER_TYPES_NORMAL: WeatherType[] = ['clear', 'cloudy', 'fog', 'windy'];
const WEATHER_TYPES_RAIN: WeatherType[] = ['rain', 'heavy_rain'];
const WEATHER_TYPES_SNOW: WeatherType[] = ['snow'];
const WEATHER_TYPES_EXTREME: WeatherType[] = ['storm', 'blizzard', 'heatwave', 'cold_wave'];

const EXTREME_WEATHER_TEMPLATES: Record<WeatherType, { name: string; description: string; effects: WeatherEffect[]; tipText: string }> = {
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
  clear: { name: '', description: '', effects: [], tipText: '' },
  cloudy: { name: '', description: '', effects: [], tipText: '' },
  rain: { name: '', description: '', effects: [], tipText: '' },
  heavy_rain: { name: '', description: '', effects: [], tipText: '' },
  snow: { name: '', description: '', effects: [], tipText: '' },
  fog: { name: '', description: '', effects: [], tipText: '' },
  windy: { name: '', description: '', effects: [], tipText: '' },
};

const SEASON_TEMP_MODIFIERS: Record<string, { tempOffset: number; rainChance: number; snowChance: number; extremeChance: number }> = {
  temperate: { tempOffset: 0, rainChance: 0.25, snowChance: 0.05, extremeChance: 0.1 },
  tropical: { tempOffset: 10, rainChance: 0.35, snowChance: 0, extremeChance: 0.15 },
  arctic: { tempOffset: -20, rainChance: 0.1, snowChance: 0.4, extremeChance: 0.2 },
  desert: { tempOffset: 15, rainChance: 0.05, snowChance: 0, extremeChance: 0.12 },
};

export class WeatherGeneration {
  private config: WeatherConfig;
  private currentWeather: WeatherState;
  private currentHour: number = 6;
  private totalHoursElapsed: number = 0;
  private rng: SeededRandom;
  private activeExtremeEvent: ExtremeWeatherEvent | null = null;
  private extremeEventRemaining: number = 0;

  constructor(config: Partial<WeatherConfig>, rng: SeededRandom) {
    this.config = { ...DEFAULT_WEATHER_CONFIG, ...config };
    this.rng = rng;
    this.currentWeather = {
      type: 'clear',
      temperature: this.config.baseTemperature,
      windSpeed: 5,
      visibility: 100,
      humidity: 50,
      severity: 0,
      dayPhase: 'morning',
      hour: 6,
    };
  }

  generateNextWeather(deltaHours: number): WeatherState {
    this.currentHour += deltaHours;
    this.totalHoursElapsed += deltaHours;

    const dayTotal = this.config.dayLength + this.config.nightLength;
    const hourOfDay = ((this.currentHour % dayTotal) + dayTotal) % dayTotal;

    this.currentWeather.dayPhase = this.getPhase(hourOfDay);
    this.currentWeather.hour = hourOfDay;

    const tempCycle = Math.sin((hourOfDay / dayTotal) * Math.PI * 2 - Math.PI / 2);
    const baseTemp = this.config.baseTemperature + tempCycle * this.config.temperatureAmplitude;
    const season = SEASON_TEMP_MODIFIERS[this.config.seasonType];
    this.currentWeather.temperature = baseTemp + season.tempOffset;

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
      this.rollWeatherType(season);
    }

    this.currentWeather.temperature = Math.round(this.currentWeather.temperature * 10) / 10;
    this.currentWeather.severity = this.getSeverity(this.currentWeather.type);

    return { ...this.currentWeather };
  }

  private rollWeatherType(season: { rainChance: number; snowChance: number; extremeChance: number }): void {
    if (this.rng.chance(season.extremeChance)) {
      const extreme = this.rng.pick(WEATHER_TYPES_EXTREME);
      this.currentWeather.type = extreme;
      this.triggerExtremeWeather(extreme);
      return;
    }

    const roll = this.rng.next();
    if (roll < season.snowChance && this.currentWeather.temperature < 2) {
      this.currentWeather.type = this.rng.pick(WEATHER_TYPES_SNOW);
    } else if (roll < season.snowChance + season.rainChance) {
      this.currentWeather.type = this.rng.pick(WEATHER_TYPES_RAIN);
      this.currentWeather.humidity = clamp(this.currentWeather.humidity + 30, 0, 100);
    } else if (roll < season.snowChance + season.rainChance + 0.15) {
      this.currentWeather.type = this.rng.pick(['fog', 'windy'] as WeatherType[]);
    } else {
      this.currentWeather.type = this.rng.pick(WEATHER_TYPES_NORMAL);
    }

    this.currentWeather.windSpeed = this.rng.nextInt(0, this.currentWeather.type === 'windy' ? 60 : 25);
    this.currentWeather.humidity = this.currentWeather.type === 'rain' || this.currentWeather.type === 'heavy_rain'
      ? this.rng.nextInt(70, 95)
      : this.rng.nextInt(30, 70);
  }

  triggerExtremeWeather(type: WeatherType): ExtremeWeatherEvent {
    const template = EXTREME_WEATHER_TEMPLATES[type];
    const intensity = this.rng.nextFloat(0.5, 1.0);
    const duration = this.rng.nextFloat(2, 8);

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
