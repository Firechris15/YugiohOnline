// Tiny JSON-file persistence for online game records.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameRecord } from '../src/engine/meta';

const MAX_RECORDS = 20_000;

export class RecordStore {
  private records: GameRecord[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string) {
    try {
      if (existsSync(file)) {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        if (Array.isArray(data)) this.records = data;
      }
    } catch (e) {
      console.warn('Could not read records, starting fresh:', (e as Error).message);
    }
  }

  all(): GameRecord[] {
    return this.records;
  }

  add(r: GameRecord): void {
    this.records.push(r);
    if (this.records.length > MAX_RECORDS) this.records.splice(0, this.records.length - MAX_RECORDS);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 2000);
  }

  flush(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.records));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error('Could not save records:', (e as Error).message);
    }
  }
}
