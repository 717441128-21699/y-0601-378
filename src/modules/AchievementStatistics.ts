import {
  AchievementDef,
  AchievementCondition,
  SurvivalStats,
  AchievementProgress,
  RecentlyUnlockedAchievement,
  TipTextContext,
  WeatherType,
} from '../types';

const DEFAULT_TIP_TEMPLATES: Record<string, string> = {
  low_health: '你的生命值很低，注意安全！',
  low_hunger: '肚子饿得咕咕叫，找点食物吧。',
  low_thirst: '嘴唇干裂，赶紧找水喝。',
  cold_weather: '天寒地冻，生火取暖！',
  hot_weather: '烈日炎炎，注意防暑降温。',
  night_falling: '夜幕降临，野外危险加倍。',
  storm_coming: '暴风雨要来了，赶紧回营地！',
  good_condition: '状态不错，趁现在探索或收集资源。',
  early_days: '生存初期，优先确保基本需求：食物、水源和避难所。',
  mid_days: '你已经撑过最困难的阶段，考虑升级营地设施。',
  late_days: '你是老手了！帮助需要的人，也许会有意外收获。',
};

export class AchievementStatistics {
  private achievements: Map<string, AchievementDef> = new Map();
  private unlockedAchievements: Map<string, number> = new Map();
  private stats: SurvivalStats;
  private customTipTemplates: Map<string, string> = new Map();

  constructor() {
    this.stats = {
      daysSurvived: 0,
      totalGatherCount: 0,
      totalCraftCount: 0,
      totalEventsResolved: 0,
      totalFacilityUpgrades: 0,
      weatherSurvived: {},
      deathCount: 0,
      causeOfDeath: [],
      longestSurvival: 0,
      achievementsUnlocked: [],
      recentlyUnlocked: [],
    };
  }

  registerAchievement(achievement: AchievementDef): void {
    this.achievements.set(achievement.id, achievement);
  }

  registerAchievements(achievements: AchievementDef[]): void {
    achievements.forEach((a) => this.achievements.set(a.id, a));
  }

  recordSurvivalDay(): AchievementDef[] {
    this.stats.daysSurvived += 1;
    if (this.stats.daysSurvived > this.stats.longestSurvival) {
      this.stats.longestSurvival = this.stats.daysSurvived;
    }
    return this.checkMilestones();
  }

  recordGather(count: number = 1): AchievementDef[] {
    this.stats.totalGatherCount += count;
    return this.checkMilestones();
  }

  recordCraft(count: number = 1): AchievementDef[] {
    this.stats.totalCraftCount += count;
    return this.checkMilestones();
  }

  recordEventResolved(): AchievementDef[] {
    this.stats.totalEventsResolved += 1;
    return this.checkMilestones();
  }

  recordFacilityUpgrade(): AchievementDef[] {
    this.stats.totalFacilityUpgrades += 1;
    return this.checkMilestones();
  }

  recordWeatherSurvived(weatherType: WeatherType): void {
    this.stats.weatherSurvived[weatherType] = (this.stats.weatherSurvived[weatherType] ?? 0) + 1;
  }

  recordDeath(cause: string): void {
    this.stats.deathCount += 1;
    this.stats.causeOfDeath.push(cause);
  }

  checkMilestones(): AchievementDef[] {
    const newlyUnlocked: AchievementDef[] = [];
    const now = Date.now();

    for (const [id, achievement] of this.achievements) {
      if (this.unlockedAchievements.has(id)) continue;

      if (this.evaluateCondition(achievement.condition)) {
        this.unlockedAchievements.set(id, now);
        this.stats.achievementsUnlocked.push(id);
        const recentEntry: RecentlyUnlockedAchievement = {
          achievement: { ...achievement },
          unlockedAt: now,
        };
        this.stats.recentlyUnlocked.push(recentEntry);
        if (this.stats.recentlyUnlocked.length > 20) {
          this.stats.recentlyUnlocked = this.stats.recentlyUnlocked.slice(-20);
        }
        newlyUnlocked.push({ ...achievement });
      }
    }

    return newlyUnlocked;
  }

  getSurvivalDays(): number {
    return this.stats.daysSurvived;
  }

  getStatistics(): SurvivalStats {
    return {
      ...this.stats,
      weatherSurvived: { ...this.stats.weatherSurvived },
      causeOfDeath: [...this.stats.causeOfDeath],
      achievementsUnlocked: [...this.stats.achievementsUnlocked],
      recentlyUnlocked: this.stats.recentlyUnlocked.map((r) => ({
        achievement: { ...r.achievement },
        unlockedAt: r.unlockedAt,
      })),
    };
  }

  getUnlockedAchievements(): AchievementDef[] {
    return Array.from(this.achievements.values())
      .filter((a) => this.unlockedAchievements.has(a.id))
      .map((a) => ({ ...a }));
  }

  getAllAchievements(): AchievementDef[] {
    return Array.from(this.achievements.values()).map((a) => ({ ...a }));
  }

  isAchievementUnlocked(id: string): boolean {
    return this.unlockedAchievements.has(id);
  }

  getRecentlyUnlocked(limit: number = 5): RecentlyUnlockedAchievement[] {
    return this.stats.recentlyUnlocked.slice(-limit).reverse();
  }

  getAchievementProgress(): AchievementProgress[] {
    return Array.from(this.achievements.values()).map((a) => {
      const current = this.getCurrentProgress(a.condition);
      const target = a.condition.value;
      const percent = Math.min(100, Math.round((current / target) * 100));
      const unlockedAt = this.unlockedAchievements.get(a.id);

      return {
        id: a.id,
        name: a.name,
        current,
        target,
        percent,
        unlocked: this.unlockedAchievements.has(a.id),
        unlockedAt,
      };
    });
  }

  getAchievementProgressById(id: string): AchievementProgress | null {
    const achievement = this.achievements.get(id);
    if (!achievement) return null;

    const current = this.getCurrentProgress(achievement.condition);
    const target = achievement.condition.value;
    const percent = Math.min(100, Math.round((current / target) * 100));
    const unlockedAt = this.unlockedAchievements.get(id);

    return {
      id: achievement.id,
      name: achievement.name,
      current,
      target,
      percent,
      unlocked: this.unlockedAchievements.has(id),
      unlockedAt,
    };
  }

  getTotalProgress(): { unlocked: number; total: number; percent: number } {
    const total = this.achievements.size;
    const unlocked = this.unlockedAchievements.size;
    const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;
    return { unlocked, total, percent };
  }

  getTipText(context: TipTextContext): string {
    const tips: string[] = [];

    if (context.vitals) {
      if (context.vitals.health < 30) tips.push(DEFAULT_TIP_TEMPLATES.low_health);
      if (context.vitals.hunger < 25) tips.push(DEFAULT_TIP_TEMPLATES.low_hunger);
      if (context.vitals.thirst < 20) tips.push(DEFAULT_TIP_TEMPLATES.low_thirst);
      if (context.vitals.bodyTemp < 33) tips.push(DEFAULT_TIP_TEMPLATES.cold_weather);
      if (context.vitals.bodyTemp > 40) tips.push(DEFAULT_TIP_TEMPLATES.hot_weather);
    }

    if (context.weather) {
      if (context.weather.type === 'storm' || context.weather.type === 'blizzard') {
        tips.push(DEFAULT_TIP_TEMPLATES.storm_coming);
      }
      if (context.weather.dayPhase === 'dusk' || context.weather.dayPhase === 'night') {
        tips.push(DEFAULT_TIP_TEMPLATES.night_falling);
      }
    }

    if (context.survivalDays !== undefined) {
      if (context.survivalDays < 3) tips.push(DEFAULT_TIP_TEMPLATES.early_days);
      else if (context.survivalDays < 10) tips.push(DEFAULT_TIP_TEMPLATES.mid_days);
      else tips.push(DEFAULT_TIP_TEMPLATES.late_days);
    }

    if (tips.length === 0) {
      tips.push(DEFAULT_TIP_TEMPLATES.good_condition);
    }

    for (const [key, template] of this.customTipTemplates) {
      if (tips.length < 3 && this.shouldShowCustomTip(key, context)) {
        tips.push(template);
      }
    }

    return tips.join(' ');
  }

  registerTipTemplate(key: string, template: string): void {
    this.customTipTemplates.set(key, template);
  }

  resetStats(): void {
    this.stats = {
      daysSurvived: 0,
      totalGatherCount: 0,
      totalCraftCount: 0,
      totalEventsResolved: 0,
      totalFacilityUpgrades: 0,
      weatherSurvived: {},
      deathCount: 0,
      causeOfDeath: [],
      longestSurvival: this.stats.longestSurvival,
      achievementsUnlocked: [],
      recentlyUnlocked: [],
    };
  }

  private getCurrentProgress(condition: AchievementCondition): number {
    switch (condition.type) {
      case 'survival_days':
        return this.stats.daysSurvived;
      case 'craft_count':
        return this.stats.totalCraftCount;
      case 'gather_count':
        return this.stats.totalGatherCount;
      case 'event_resolved':
        return this.stats.totalEventsResolved;
      case 'facility_upgrade':
        return this.stats.totalFacilityUpgrades;
      case 'weather_survived':
        return Object.values(this.stats.weatherSurvived).reduce((s, v) => s + v, 0);
      default:
        return 0;
    }
  }

  private evaluateCondition(condition: AchievementCondition): boolean {
    switch (condition.type) {
      case 'survival_days':
        return this.stats.daysSurvived >= condition.value;
      case 'craft_count':
        return this.stats.totalCraftCount >= condition.value;
      case 'gather_count':
        return this.stats.totalGatherCount >= condition.value;
      case 'event_resolved':
        return this.stats.totalEventsResolved >= condition.value;
      case 'facility_upgrade':
        return this.stats.totalFacilityUpgrades >= condition.value;
      case 'weather_survived':
        return Object.values(this.stats.weatherSurvived).some((v) => v >= condition.value);
      default:
        return false;
    }
  }

  private shouldShowCustomTip(key: string, context: TipTextContext): boolean {
    if (key.startsWith('weather_') && context.weather) {
      return context.weather.type === key.replace('weather_', '');
    }
    if (key.startsWith('vitals_') && context.vitals) {
      const vitalsKey = key.replace('vitals_', '') as keyof typeof context.vitals;
      return context.vitals[vitalsKey] !== undefined && context.vitals[vitalsKey] < 30;
    }
    return false;
  }
}
