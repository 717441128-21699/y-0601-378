import { Vitals, VitalsConfig, VitalsWarning, WeatherState } from '../types';
import { clamp } from '../utils';

const DEFAULT_VITALS_CONFIG: VitalsConfig = {
  hungerDecayRate: 2.0,
  thirstDecayRate: 2.5,
  tempDecayRate: 0.5,
  staminaRegenRate: 5.0,
  criticalHungerThreshold: 20,
  criticalThirstThreshold: 15,
  criticalTempLow: 30,
  criticalTempHigh: 42,
  healthDecayOnCritical: 3.0,
  maxHunger: 100,
  maxThirst: 100,
  maxHealth: 100,
  maxStamina: 100,
  minTemp: 20,
  maxTemp: 45,
};

export class CharacterStatus {
  private vitals: Vitals;
  private config: VitalsConfig;

  constructor(config?: Partial<VitalsConfig>) {
    this.config = { ...DEFAULT_VITALS_CONFIG, ...config };
    this.vitals = {
      hunger: this.config.maxHunger,
      thirst: this.config.maxThirst,
      bodyTemp: 37,
      health: this.config.maxHealth,
      stamina: this.config.maxStamina,
    };
  }

  setVitals(partial: Partial<Vitals>): void {
    if (partial.hunger !== undefined) {
      this.vitals.hunger = clamp(partial.hunger, 0, this.config.maxHunger);
    }
    if (partial.thirst !== undefined) {
      this.vitals.thirst = clamp(partial.thirst, 0, this.config.maxThirst);
    }
    if (partial.bodyTemp !== undefined) {
      this.vitals.bodyTemp = clamp(partial.bodyTemp, this.config.minTemp, this.config.maxTemp);
    }
    if (partial.health !== undefined) {
      this.vitals.health = clamp(partial.health, 0, this.config.maxHealth);
    }
    if (partial.stamina !== undefined) {
      this.vitals.stamina = clamp(partial.stamina, 0, this.config.maxStamina);
    }
  }

  getVitals(): Vitals {
    return { ...this.vitals };
  }

  updateVitals(deltaHours: number, weather?: WeatherState): VitalsWarning[] {
    const warnings: VitalsWarning[] = [];

    this.vitals.hunger = clamp(
      this.vitals.hunger - this.config.hungerDecayRate * deltaHours,
      0,
      this.config.maxHunger
    );

    this.vitals.thirst = clamp(
      this.vitals.thirst - this.config.thirstDecayRate * deltaHours,
      0,
      this.config.maxThirst
    );

    if (weather) {
      const tempDiff = weather.temperature - this.vitals.bodyTemp;
      this.vitals.bodyTemp = clamp(
        this.vitals.bodyTemp + tempDiff * this.config.tempDecayRate * deltaHours * 0.1,
        this.config.minTemp,
        this.config.maxTemp
      );

      if (weather.type === 'heavy_rain' || weather.type === 'storm' || weather.type === 'blizzard') {
        this.vitals.bodyTemp = clamp(
          this.vitals.bodyTemp - 2 * deltaHours,
          this.config.minTemp,
          this.config.maxTemp
        );
        this.vitals.stamina = clamp(
          this.vitals.stamina - 1 * deltaHours,
          0,
          this.config.maxStamina
        );
      }
    }

    const resting = this.vitals.stamina < this.config.maxStamina;
    if (resting) {
      this.vitals.stamina = clamp(
        this.vitals.stamina + this.config.staminaRegenRate * deltaHours,
        0,
        this.config.maxStamina
      );
    }

    let healthDecay = 0;
    if (this.vitals.hunger < this.config.criticalHungerThreshold) {
      healthDecay += this.config.healthDecayOnCritical;
      warnings.push({
        type: 'hunger',
        severity: this.vitals.hunger < 10 ? 'critical' : this.vitals.hunger < this.config.criticalHungerThreshold ? 'medium' : 'low',
        message: this.vitals.hunger < 10
          ? '饥饿即将致命！立刻寻找食物！'
          : '你感到饥饿，需要尽快进食。',
      });
    }

    if (this.vitals.thirst < this.config.criticalThirstThreshold) {
      healthDecay += this.config.healthDecayOnCritical;
      warnings.push({
        type: 'thirst',
        severity: this.vitals.thirst < 8 ? 'critical' : this.vitals.thirst < this.config.criticalThirstThreshold ? 'medium' : 'low',
        message: this.vitals.thirst < 8
          ? '严重脱水！你急需水源！'
          : '口渴难耐，需要补充水分。',
      });
    }

    if (this.vitals.bodyTemp < this.config.criticalTempLow) {
      healthDecay += this.config.healthDecayOnCritical;
      warnings.push({
        type: 'temperature',
        severity: 'critical',
        message: '体温过低！立刻取暖，否则将失去意识！',
      });
    } else if (this.vitals.bodyTemp > this.config.criticalTempHigh) {
      healthDecay += this.config.healthDecayOnCritical;
      warnings.push({
        type: 'temperature',
        severity: 'critical',
        message: '体温过高！中暑危险，寻找阴凉处！',
      });
    }

    if (healthDecay > 0) {
      this.vitals.health = clamp(
        this.vitals.health - healthDecay * deltaHours,
        0,
        this.config.maxHealth
      );
    }

    if (this.vitals.health < 20) {
      warnings.push({
        type: 'health',
        severity: this.vitals.health < 10 ? 'critical' : 'medium',
        message: this.vitals.health < 10
          ? '生命垂危！情况万分危急！'
          : '健康状况恶化，需要治疗。',
      });
    }

    if (this.vitals.stamina < 15) {
      warnings.push({
        type: 'stamina',
        severity: 'low',
        message: '体力不足，行动效率降低。',
      });
    }

    return warnings;
  }

  isAlive(): boolean {
    return this.vitals.health > 0;
  }

  getCauseOfDeath(): string | null {
    if (this.vitals.health > 0) return null;
    if (this.vitals.hunger <= 0) return '饥饿致死';
    if (this.vitals.thirst <= 0) return '脱水致死';
    if (this.vitals.bodyTemp <= this.config.criticalTempLow) return '失温致死';
    if (this.vitals.bodyTemp >= this.config.criticalTempHigh) return '中暑致死';
    return '伤重不治';
  }

  applyFoodEffect(hungerRestore: number, thirstRestore: number, healthRestore: number, tempEffect: number): void {
    this.vitals.hunger = clamp(this.vitals.hunger + hungerRestore, 0, this.config.maxHunger);
    this.vitals.thirst = clamp(this.vitals.thirst + thirstRestore, 0, this.config.maxThirst);
    this.vitals.health = clamp(this.vitals.health + healthRestore, 0, this.config.maxHealth);
    this.vitals.bodyTemp = clamp(this.vitals.bodyTemp + tempEffect, this.config.minTemp, this.config.maxTemp);
  }

  applyDamage(damage: number): void {
    this.vitals.health = clamp(this.vitals.health - damage, 0, this.config.maxHealth);
  }

  consumeStamina(amount: number): boolean {
    if (this.vitals.stamina < amount) return false;
    this.vitals.stamina = clamp(this.vitals.stamina - amount, 0, this.config.maxStamina);
    return true;
  }

  reset(): void {
    this.vitals = {
      hunger: this.config.maxHunger,
      thirst: this.config.maxThirst,
      bodyTemp: 37,
      health: this.config.maxHealth,
      stamina: this.config.maxStamina,
    };
  }

  getSnapshot(): { vitals: Vitals } {
    return { vitals: { ...this.vitals } };
  }

  loadSnapshot(snapshot: { vitals: Vitals }): void {
    this.vitals = { ...snapshot.vitals };
  }
}
