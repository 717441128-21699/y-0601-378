import {
  FacilityDef,
  FacilityType,
  FacilityEffect,
  SafetyReport,
  SafetyIssue,
  RecipeMaterial,
  WeatherState,
} from '../types';
import { clamp, SeededRandom } from '../utils';

export class CampFacility {
  private facilities: Map<string, FacilityDef> = new Map();
  private facilityHealth: Map<string, number> = new Map();
  private rng: SeededRandom;

  constructor(rng: SeededRandom) {
    this.rng = rng;
  }

  buildFacility(def: Omit<FacilityDef, 'level'>): FacilityDef | null {
    const facility: FacilityDef = {
      ...def,
      level: 1,
    };
    this.facilities.set(def.id, facility);
    this.facilityHealth.set(def.id, 100);
    return { ...facility };
  }

  upgradeFacility(facilityId: string, consumeMaterials: (mats: RecipeMaterial[]) => boolean): { success: boolean; facility?: FacilityDef; tipText: string } {
    const facility = this.facilities.get(facilityId);
    if (!facility) {
      return { success: false, tipText: `未找到设施: ${facilityId}` };
    }

    if (facility.level >= facility.maxLevel) {
      return { success: false, facility: { ...facility }, tipText: `${facility.name}已达到最高等级。` };
    }

    if (!consumeMaterials(facility.upgradeMaterials)) {
      return { success: false, facility: { ...facility }, tipText: '升级材料不足。' };
    }

    facility.level += 1;
    facility.safetyBonus = Math.round(facility.safetyBonus * 1.5);
    facility.warmthBonus = Math.round(facility.warmthBonus * 1.4);
    facility.storageBonus = Math.round(facility.storageBonus * 1.3);
    facility.craftBonus = Math.round(facility.craftBonus * 1.3);

    for (const effect of facility.effects) {
      effect.value = Math.round(effect.value * 1.4);
    }

    this.facilityHealth.set(facilityId, 100);

    return {
      success: true,
      facility: { ...facility },
      tipText: `${facility.name}升级到 Lv.${facility.level}！`,
    };
  }

  damageFacility(facilityId: string, damageAmount: number): { destroyed: boolean; health: number; tipText: string } {
    const health = this.facilityHealth.get(facilityId) ?? 100;
    const newHealth = clamp(health - damageAmount, 0, 100);
    this.facilityHealth.set(facilityId, newHealth);

    const facility = this.facilities.get(facilityId);
    if (newHealth <= 0 && facility) {
      return {
        destroyed: true,
        health: 0,
        tipText: `${facility.name}已被摧毁！`,
      };
    }

    return {
      destroyed: false,
      health: newHealth,
      tipText: facility ? `${facility.name}受到 ${damageAmount} 点损坏（剩余耐久: ${newHealth}%）` : '设施受损',
    };
  }

  repairFacility(facilityId: string, repairAmount: number): { success: boolean; health: number; tipText: string } {
    const health = this.facilityHealth.get(facilityId) ?? 0;
    if (health >= 100) {
      return { success: false, health, tipText: '设施无需修理。' };
    }

    const newHealth = clamp(health + repairAmount, 0, 100);
    this.facilityHealth.set(facilityId, newHealth);

    const facility = this.facilities.get(facilityId);
    return {
      success: true,
      health: newHealth,
      tipText: facility ? `${facility.name}修理完成（耐久: ${newHealth}%）` : '修理完成',
    };
  }

  assessShelterSafety(shelterId: string, weather?: WeatherState): SafetyReport {
    const facility = this.facilities.get(shelterId);
    if (!facility) {
      return {
        shelterId,
        overallSafety: 0,
        weatherProtection: 0,
        raidDefense: 0,
        wildlifeDefense: 0,
        fireSafety: 0,
        issues: [{ type: 'structural_damage', severity: 'high', description: '避难所不存在。' }],
        tipText: '此处没有避难所！',
      };
    }

    const health = this.facilityHealth.get(shelterId) ?? 100;
    const issues: SafetyIssue[] = [];

    let weatherProtection = facility.warmthBonus * (health / 100);
    if (weather) {
      if ((weather.type === 'storm' || weather.type === 'blizzard' || weather.type === 'heavy_rain') && facility.warmthBonus < 30) {
        issues.push({
          type: 'weather_exposure',
          severity: 'high',
          description: '当前天气恶劣，避难所保暖不足以抵御。',
        });
        weatherProtection *= 0.5;
      }
    }

    if (health < 50) {
      issues.push({
        type: 'structural_damage',
        severity: health < 25 ? 'high' : 'medium',
        description: `避难所耐久 ${health}%，需要修理。`,
      });
    }

    let raidDefense = facility.safetyBonus * (health / 100);
    const hasWall = Array.from(this.facilities.values()).some((f) => f.type === 'wall' && (this.facilityHealth.get(f.id) ?? 0) > 0);
    const hasWatchtower = Array.from(this.facilities.values()).some((f) => f.type === 'watchtower' && (this.facilityHealth.get(f.id) ?? 0) > 0);

    if (!hasWall) {
      issues.push({
        type: 'weak_walls',
        severity: 'medium',
        description: '没有围墙，营地容易遭到袭击。',
      });
      raidDefense *= 0.6;
    }

    if (!hasWatchtower) {
      issues.push({
        type: 'no_watchtower',
        severity: 'low',
        description: '没有瞭望塔，无法提前发现威胁。',
      });
      raidDefense *= 0.8;
    }

    const hasFire = Array.from(this.facilities.values()).some((f) => f.type === 'fire' && (this.facilityHealth.get(f.id) ?? 0) > 0);
    let wildlifeDefense = facility.safetyBonus * (health / 100);
    if (!hasFire) {
      issues.push({
        type: 'no_fire',
        severity: 'medium',
        description: '没有营火，夜间可能吸引野兽。',
      });
      wildlifeDefense *= 0.5;
    }

    let fireSafety = 80;
    if (hasFire && health < 40) {
      fireSafety -= 30;
      issues.push({
        type: 'structural_damage',
        severity: 'medium',
        description: '营火附近设施破损，存在火灾隐患。',
      });
    }

    weatherProtection = clamp(Math.round(weatherProtection), 0, 100);
    raidDefense = clamp(Math.round(raidDefense), 0, 100);
    wildlifeDefense = clamp(Math.round(wildlifeDefense), 0, 100);
    fireSafety = clamp(Math.round(fireSafety), 0, 100);

    const overallSafety = clamp(
      Math.round((weatherProtection + raidDefense + wildlifeDefense + fireSafety) / 4),
      0,
      100
    );

    let tipText = `避难所安全评估: ${overallSafety}%`;
    if (overallSafety < 30) {
      tipText += ' —— 极度危险！立刻加固！';
    } else if (overallSafety < 60) {
      tipText += ' —— 存在隐患，建议改善。';
    } else {
      tipText += ' —— 相对安全。';
    }

    return {
      shelterId,
      overallSafety,
      weatherProtection,
      raidDefense,
      wildlifeDefense,
      fireSafety,
      issues,
      tipText,
    };
  }

  getFacility(id: string): FacilityDef | undefined {
    const facility = this.facilities.get(id);
    return facility ? { ...facility } : undefined;
  }

  getFacilityHealth(id: string): number {
    return this.facilityHealth.get(id) ?? 0;
  }

  getFacilities(): FacilityDef[] {
    return Array.from(this.facilities.values()).map((f) => ({ ...f }));
  }

  getFacilitiesByType(type: FacilityType): FacilityDef[] {
    return Array.from(this.facilities.values()).filter((f) => f.type === type).map((f) => ({ ...f }));
  }

  getWarmthBonus(): number {
    return Array.from(this.facilities.values()).reduce((sum, f) => {
      const health = this.facilityHealth.get(f.id) ?? 0;
      return sum + f.warmthBonus * (health / 100);
    }, 0);
  }

  getSafetyBonus(): number {
    return Array.from(this.facilities.values()).reduce((sum, f) => {
      const health = this.facilityHealth.get(f.id) ?? 0;
      return sum + f.safetyBonus * (health / 100);
    }, 0);
  }

  hasFacilityOfType(type: FacilityType): boolean {
    return Array.from(this.facilities.values()).some(
      (f) => f.type === type && (this.facilityHealth.get(f.id) ?? 0) > 0
    );
  }

  removeFacility(id: string): boolean {
    this.facilityHealth.delete(id);
    return this.facilities.delete(id);
  }
}
