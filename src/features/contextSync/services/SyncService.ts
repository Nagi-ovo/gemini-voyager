import { DialogNode, SyncResponse } from '../types';

const SYNC_SERVER_URL = 'http://127.0.0.1:3030/sync';

export class SyncService {
  private static instance: SyncService;

  private constructor() {}

  static getInstance(): SyncService {
    if (!this.instance) {
      this.instance = new SyncService();
    }
    return this.instance;
  }

  async checkServerStatus(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 200);
      
      await fetch(SYNC_SERVER_URL, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return true;
    } catch (err) {
      return false;
    }
  }

  async syncToIDE(data: DialogNode[]): Promise<SyncResponse> {
    console.log('📡 Syncing to Code Editor server...', data);
    try {
      const response = await fetch(SYNC_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Code Editor Server not responding.');
      }

      return await response.json();
    } catch (err) {
      throw new Error((err as Error).message);
    }
  }
}
