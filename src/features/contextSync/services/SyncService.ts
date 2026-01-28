import { DialogNode, SyncResponse } from '../types';

export class SyncService {
  private static instance: SyncService;
  private readonly DEFAULT_PORT = 3030;

  private constructor() {}

  static getInstance(): SyncService {
    if (!this.instance) {
      this.instance = new SyncService();
    }
    return this.instance;
  }

  private async getServerUrl(): Promise<string> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['contextSyncPort'], (result) => {
        const port = result.contextSyncPort || this.DEFAULT_PORT;
        resolve(`http://127.0.0.1:${port}/sync`);
      });
    });
  }

  async checkServerStatus(): Promise<boolean> {
    let timeoutId: any;
    try {
      const url = await this.getServerUrl();
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 200);

      await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      return true;
    } catch (err) {
      return false;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async syncToIDE(data: DialogNode[]): Promise<SyncResponse> {
    console.log('📡 Syncing to Code Editor server...', data);
    try {
      const url = await this.getServerUrl();
      const response = await fetch(url, {
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
