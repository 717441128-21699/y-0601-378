import {
  SurvivalEvent,
  SurvivalEventType,
  EventSeverity,
  EventResult,
  EventCondition,
  EventEffect,
  EventChoice,
  InjuryResult,
  PoisoningResult,
  LostResult,
  RaidResult,
  RaidLoss,
  RescueResult,
  WeatherState,
  Vitals,
} from '../types';
import { SeededRandom, clamp } from '../utils';

export class EventDrawing {
  private events: Map<string, SurvivalEvent> = new Map();
  private activeEffects: Map<string, { effect: EventEffect; remainingTicks: number }> = new Map();
  private rng: SeededRandom;
  private eventHistory: EventResult[] = [];

  constructor(rng: SeededRandom) {
    this.rng = rng;
  }

  registerEvent(event: SurvivalEvent): void {
    this.events.set(event.id, event);
  }

  registerEvents(events: SurvivalEvent[]): void {
    events.forEach((e) => this.events.set(e.id, e));
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
    const eligible = Array.from(this.events.values()).filter((e) => {
      if (typeFilter && e.type !== typeFilter) return false;
      return this.checkConditions(e.conditions, context);
    });

    if (eligible.length === 0) return null;

    const event = this.rng.weightedPick(eligible);
    const triggered = this.rng.chance(event.probability);

    if (!triggered) {
      return {
        eventId: event.id,
        triggered: false,
        effects: [],
        tipText: '什么也没有发生……暂时。',
      };
    }

    const effects: EventEffect[] = [...event.effects];

    let chosenChoice: string | undefined;
    if (event.choices && event.choices.length > 0) {
      const choice = event.choices[0];
      chosenChoice = choice.id;

      if (this.rng.chance(choice.successChance)) {
        effects.push(...choice.successEffects);
      } else {
        effects.push(...choice.failureEffects);
      }
    }

    for (const effect of effects) {
      this.activeEffects.set(`${event.id}_${effect.type}`, {
        effect,
        remainingTicks: 5,
      });
    }

    const result: EventResult = {
      eventId: event.id,
      triggered: true,
      chosenChoice,
      effects,
      tipText: event.tipText,
    };

    this.eventHistory.push(result);
    return result;
  }

  drawMultiple(
    count: number,
    context: {
      survivalDays: number;
      vitals?: Vitals;
      weather?: WeatherState;
      hasItem?: (id: string) => boolean;
      facilityLevel?: (id: string) => number;
    }
  ): EventResult[] {
    const results: EventResult[] = [];
    for (let i = 0; i < count; i++) {
      const result = this.drawEvent(context);
      if (result) results.push(result);
    }
    return results;
  }

  handleInjury(type: InjuryResult['type'], severity: EventSeverity): InjuryResult {
    const severityMultipliers: Record<EventSeverity, number> = {
      minor: 0.3,
      moderate: 0.6,
      major: 0.85,
      critical: 1.0,
    };
    const mult = severityMultipliers[severity];

    const typeConfigs: Record<string, { healthLoss: number; staminaPenalty: number; speedPenalty: number; healingTime: number; tipText: string }> = {
      cut: { healthLoss: 15, staminaPenalty: 5, speedPenalty: 10, healingTime: 8, tipText: '你被割伤了，需要包扎止血。' },
      burn: { healthLoss: 20, staminaPenalty: 10, speedPenalty: 5, healingTime: 12, tipText: '烧伤了！冷水冲洗后进行包扎。' },
      fracture: { healthLoss: 30, staminaPenalty: 20, speedPenalty: 50, healingTime: 48, tipText: '骨折了！需要夹板固定和长时间休养。' },
      sprain: { healthLoss: 10, staminaPenalty: 15, speedPenalty: 30, healingTime: 24, tipText: '扭伤了！减少活动，静养恢复。' },
      bruise: { healthLoss: 5, staminaPenalty: 5, speedPenalty: 10, healingTime: 6, tipText: '淤伤了，休息一下就会好转。' },
      frostbite: { healthLoss: 25, staminaPenalty: 15, speedPenalty: 40, healingTime: 36, tipText: '冻伤了！需要缓慢复温，切勿摩擦患处。' },
    };

    const config = typeConfigs[type] ?? typeConfigs.cut;

    return {
      type,
      severity,
      healthLoss: Math.round(config.healthLoss * mult),
      staminaPenalty: Math.round(config.staminaPenalty * mult),
      speedPenalty: Math.round(config.speedPenalty * mult),
      healingTime: Math.round(config.healingTime * mult),
      tipText: config.tipText,
    };
  }

  handlePoisoning(source: string, severity: EventSeverity): PoisoningResult {
    const configs: Record<EventSeverity, { healthLoss: number; duration: number; stamina: number }> = {
      minor: { healthLoss: 2, duration: 6, stamina: 10 },
      moderate: { healthLoss: 5, duration: 12, stamina: 20 },
      major: { healthLoss: 8, duration: 24, stamina: 35 },
      critical: { healthLoss: 12, duration: 48, stamina: 50 },
    };

    const config = configs[severity];

    return {
      source,
      severity,
      healthLossPerTick: config.healthLoss,
      duration: config.duration,
      staminaPenalty: config.stamina,
      tipText: `中毒了！来源: ${source}。持续 ${config.duration} 小时，每段时间损失 ${config.healthLoss} 生命值。需要解毒剂！`,
    };
  }

  triggerLost(terrain: string): LostResult {
    const distance = this.rng.nextFloat(1, 10);
    const directions = ['北', '南', '东', '西'];
    const direction = this.rng.pick(directions);

    return {
      direction,
      distanceFromCamp: Math.round(distance * 10) / 10,
      staminaDrain: Math.round(distance * 3),
      findWayChance: Math.round(this.rng.nextFloat(0.2, 0.7) * 100) / 100,
      tipText: `你在${terrain}中迷路了！营地大约在${direction}方向 ${Math.round(distance * 10) / 10} 公里外。消耗体力寻找方向。`,
    };
  }

  triggerRaid(raidConfig: { baseRaiderCount: number; baseRaidPower: number; campDefense: number }): RaidResult {
    const raiders = this.rng.nextInt(1, raidConfig.baseRaiderCount);
    const raidPower = raidConfig.baseRaidPower * raiders * this.rng.nextFloat(0.7, 1.3);
    const defensePower = raidConfig.campDefense * this.rng.nextFloat(0.8, 1.2);

    const success = defensePower >= raidPower;
    const losses: RaidLoss[] = [];

    if (!success) {
      const healthLoss = Math.round((raidPower - defensePower) * 0.5);
      losses.push({ type: 'health', value: healthLoss, description: `战斗中受伤，损失 ${healthLoss} 生命值` });

      const itemLossChance = this.rng.nextFloat(0.1, 0.4);
      losses.push({ type: 'item', value: Math.round(itemLossChance * 100), description: `约 ${Math.round(itemLossChance * 100)}% 的物资被掠夺` });

      const facilityDamage = this.rng.nextInt(10, 30);
      losses.push({ type: 'facility', value: facilityDamage, description: `营地设施受到 ${facilityDamage} 点损坏` });
    } else {
      const healthLoss = this.rng.nextInt(5, 15);
      losses.push({ type: 'health', value: healthLoss, description: `防守中轻伤，损失 ${healthLoss} 生命值` });
    }

    return {
      raiders,
      raidPower: Math.round(raidPower),
      defensePower: Math.round(defensePower),
      success,
      losses,
      tipText: success
        ? `成功击退了 ${raiders} 名袭击者！`
        : `营地被 ${raiders} 名袭击者攻破！损失惨重。`,
    };
  }

  triggerRescue(rescueConfig: { rescuerName: string; healthRestore: number }): RescueResult {
    const items: { itemId: string; name: string; quantity: number }[] = [];

    if (this.rng.chance(0.6)) {
      items.push({ itemId: 'bandage', name: '绷带', quantity: this.rng.nextInt(1, 3) });
    }
    if (this.rng.chance(0.4)) {
      items.push({ itemId: 'food_ration', name: '口粮', quantity: this.rng.nextInt(1, 2) });
    }
    if (this.rng.chance(0.2)) {
      items.push({ itemId: 'antidote', name: '解毒剂', quantity: 1 });
    }

    return {
      rescuedBy: rescueConfig.rescuerName,
      healthRestored: rescueConfig.healthRestore,
      itemsReceived: items,
      tipText: `${rescueConfig.rescuerName} 救了你！恢复了 ${rescueConfig.healthRestore} 生命值${items.length > 0 ? `，还获得了一些物资。` : '。'}`,
    };
  }

  processActiveEffects(tickCount: number = 1): EventEffect[] {
    const expiredEffects: EventEffect[] = [];

    for (const [key, entry] of this.activeEffects) {
      entry.remainingTicks -= tickCount;
      if (entry.remainingTicks <= 0) {
        expiredEffects.push(entry.effect);
        this.activeEffects.delete(key);
      }
    }

    return expiredEffects;
  }

  getActiveEffectsCount(): number {
    return this.activeEffects.size;
  }

  clearActiveEffects(): void {
    this.activeEffects.clear();
  }

  getEventHistory(): EventResult[] {
    return [...this.eventHistory];
  }

  clearHistory(): void {
    this.eventHistory = [];
  }

  getEvent(id: string): SurvivalEvent | undefined {
    return this.events.get(id);
  }

  getAllEvents(): SurvivalEvent[] {
    return Array.from(this.events.values());
  }

  getEventsByType(type: SurvivalEventType): SurvivalEvent[] {
    return Array.from(this.events.values()).filter((e) => e.type === type);
  }

  private checkConditions(
    conditions: EventCondition[],
    context: {
      survivalDays: number;
      vitals?: Vitals;
      weather?: WeatherState;
      hasItem?: (id: string) => boolean;
      facilityLevel?: (id: string) => number;
    }
  ): boolean {
    return conditions.every((cond) => {
      switch (cond.type) {
        case 'min_day':
          return context.survivalDays >= (cond.value as number);
        case 'max_day':
          return context.survivalDays <= (cond.value as number);
        case 'weather':
          return context.weather?.type === cond.value;
        case 'health_below':
          return context.vitals ? context.vitals.health < (cond.value as number) : false;
        case 'has_item':
          return context.hasItem ? context.hasItem(cond.value as string) : false;
        case 'no_item':
          return context.hasItem ? !context.hasItem(cond.value as string) : true;
        case 'facility_level':
          return context.facilityLevel ? context.facilityLevel(cond.value as string) > 0 : false;
        default:
          return true;
      }
    });
  }
}
