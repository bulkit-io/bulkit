import type { Bulkit } from '../client';

export abstract class APIResource {
  protected readonly _client: Bulkit;

  constructor(client: Bulkit) {
    this._client = client;
  }
}
