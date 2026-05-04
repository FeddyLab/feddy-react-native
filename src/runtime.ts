import type { FeddyClient } from './client';

let currentClient: FeddyClient | null = null;

export function setCurrentClient(client: FeddyClient | null): void {
  currentClient = client;
}

export function getCurrentClient(): FeddyClient | null {
  return currentClient;
}
