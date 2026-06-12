import { TimelineEntry, TimelineEntryType } from '../types';

export class Timeline {
  private entries: TimelineEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  record(
    type: TimelineEntryType,
    day: number,
    data: Record<string, unknown>,
    tipText: string
  ): TimelineEntry {
    const entry: TimelineEntry = {
      type,
      timestamp: Date.now(),
      day,
      data,
      tipText,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    return entry;
  }

  getEntries(limit?: number): TimelineEntry[] {
    const list = limit ? this.entries.slice(-limit) : this.entries;
    return list.map((e) => ({ ...e, data: { ...e.data } }));
  }

  getEntriesByType(type: TimelineEntryType, limit?: number): TimelineEntry[] {
    const filtered = this.entries.filter((e) => e.type === type);
    const list = limit ? filtered.slice(-limit) : filtered;
    return list.map((e) => ({ ...e, data: { ...e.data } }));
  }

  getEntriesByDayRange(startDay: number, endDay: number): TimelineEntry[] {
    return this.entries
      .filter((e) => e.day >= startDay && e.day <= endDay)
      .map((e) => ({ ...e, data: { ...e.data } }));
  }

  getRecentExtremeWeather(limit: number = 10): TimelineEntry[] {
    return this.getEntriesByType('extreme_weather', limit);
  }

  getRecentEvents(limit: number = 10): TimelineEntry[] {
    return this.getEntriesByType('event_result', limit);
  }

  getRecentFacilityChanges(limit: number = 10): TimelineEntry[] {
    return [
      ...this.entries.filter(
        (e) => e.type === 'facility_upgrade' || e.type === 'facility_damage' || e.type === 'facility_repair'
      ),
    ]
      .slice(-limit)
      .map((e) => ({ ...e, data: { ...e.data } }));
  }

  getRecentResourceChanges(limit: number = 10): TimelineEntry[] {
    return this.getEntriesByType('resource_change', limit);
  }

  clear(): void {
    this.entries = [];
  }

  getCount(): number {
    return this.entries.length;
  }

  getSnapshot(): TimelineEntry[] {
    return this.entries.map((e) => ({ ...e, data: { ...e.data } }));
  }

  loadSnapshot(entries: TimelineEntry[]): void {
    this.entries = entries.map((e) => ({ ...e, data: { ...e.data } }));
  }
}
