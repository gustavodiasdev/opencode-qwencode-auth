/**
 * Qwen API Client
 *
 * OpenAI-compatible client for making API calls to Qwen
 */

import { QWEN_API_CONFIG, QWEN_MODELS } from '../constants.js';
import type {
  QwenCredentials,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamChunk
} from '../types.js';
import { getValidCredentials, loadCredentials, isCredentialsExpired } from './auth.js';
import { QwenAuthError, QwenApiError } from '../errors.js';

/**
 * QwenClient - Makes authenticated API calls to Qwen
 */
export class QwenClient {
  private credentials: QwenCredentials | null = null;
  private debug: boolean;

  constructor(options: { debug?: boolean } = {}) {
    this.debug = options.debug || process.env.OPENCODE_QWEN_DEBUG === '1';
  }

  /**
   * Get the API base URL from credentials or fallback to default
   */
  private getBaseUrl(): string {
    if (this.credentials?.resourceUrl) {
      const resourceUrl = this.credentials.resourceUrl;
      if (resourceUrl.startsWith('http')) {
        return resourceUrl.endsWith('/v1') ? resourceUrl : `${resourceUrl}/v1`;
      }
      return `https://${resourceUrl}/v1`;
    }
    return QWEN_API_CONFIG.baseUrl;
  }

  /**
   * Get the chat completions endpoint
   */
  private getChatEndpoint(): string {
    return `${this.getBaseUrl()}/chat/completions`;
  }

  /**
   * Initialize the client with credentials
   */
  async initialize(): Promise<boolean> {
    this.credentials = await getValidCredentials();
    return this.credentials !== null;
  }

  /**
   * Set credentials directly
   */
  setCredentials(credentials: QwenCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Get the authorization header
   */
  private getAuthHeader(): string {
    if (!this.credentials) {
      throw new QwenAuthError('auth_required');
    }
    return `Bearer ${this.credentials.accessToken}`;
  }

  /**
   * Log debug information
   */
  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[Qwen Client]', ...args);
    }
  }

  /**
   * Make a chat completion request
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.credentials) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new QwenAuthError('auth_required');
      }
    }

    this.log('Chat completion request:', JSON.stringify(request, null, 2));

    const response = await fetch(this.getChatEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader(),
        'Accept': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.log('API Error:', response.status, errorText);
      throw new QwenApiError(response.status, errorText);
    }

    const data = await response.json();
    this.log('Chat completion response:', JSON.stringify(data, null, 2));

    return data as ChatCompletionResponse;
  }

  /**
   * Make a streaming chat completion request
   */
  async *chatCompletionStream(request: ChatCompletionRequest): AsyncGenerator<StreamChunk> {
    if (!this.credentials) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new QwenAuthError('auth_required');
      }
    }

    const streamRequest = { ...request, stream: true };
    this.log('Streaming chat completion request:', JSON.stringify(streamRequest, null, 2));

    const response = await fetch(this.getChatEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader(),
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(streamRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.log('API Error:', response.status, errorText);
      throw new QwenApiError(response.status, errorText);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = trimmed.slice(6);
          const chunk = JSON.parse(json) as StreamChunk;
          this.log('Stream chunk:', JSON.stringify(chunk, null, 2));
          yield chunk;
        } catch (e) {
          this.log('Failed to parse chunk:', trimmed, e);
        }
      }
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<Array<{ id: string; object: string; created: number }>> {
    return Object.values(QWEN_MODELS).map(model => ({
      id: model.id,
      object: 'model',
      created: Date.now(),
    }));
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    const creds = loadCredentials();
    return creds !== null && !isCredentialsExpired(creds);
  }

  /**
   * Get current credentials info
   */
  getCredentialsInfo(): { authenticated: boolean; expiryDate?: number; resourceUrl?: string } {
    const creds = loadCredentials();
    if (!creds) {
      return { authenticated: false };
    }
    return {
      authenticated: !isCredentialsExpired(creds),
      expiryDate: creds.expiryDate,
      resourceUrl: creds.resourceUrl,
    };
  }
}

// Export singleton instance
export const qwenClient = new QwenClient();
