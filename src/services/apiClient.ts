// ============================================================
// SweetReturns — API Client
// Centralized backend communication with connection status tracking
// Tries same-origin /api/ routes (Vercel serverless) first,
// then falls back to external backend URL (localhost:8000 etc.)
// ============================================================

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'fallback';

export interface BackendHealth {
  status: string;
  databricks: boolean;
  databricks_configured: boolean;
  databricks_status: string;
  gemini?: boolean;
  stocks_available?: boolean;
}

type StatusListener = (status: ConnectionStatus) => void;

class ApiClient {
  private _externalUrl: string;
  private _status: ConnectionStatus = 'disconnected';
  private _listeners: StatusListener[] = [];
  private _healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private _lastHealth: BackendHealth | null = null;
  private _resolvedBase: string | null = null;

  constructor() {
    this._externalUrl = import.meta.env.VITE_API_URL
      || `http://${window.location.hostname}:8000`;
  }

  get baseUrl(): string { return this._resolvedBase || '/api'; }
  get status(): ConnectionStatus { return this._status; }
  get lastHealth(): BackendHealth | null { return this._lastHealth; }
  get isDatabricksConnected(): boolean {
    return this._lastHealth?.databricks === true;
  }

  onStatusChange(listener: StatusListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  private setStatus(status: ConnectionStatus) {
    if (this._status !== status) {
      this._status = status;
      this._listeners.forEach(l => l(status));
    }
  }

  /** Try fetching from a URL, return response if ok. */
  private async _tryFetch(url: string, timeout = 5000): Promise<Response | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      if (res.ok) return res;
    } catch { /* ignore */ }
    return null;
  }

  startHealthCheck() {
    this.checkHealth();
    this._healthCheckInterval = setInterval(() => this.checkHealth(), 30_000);
  }

  stopHealthCheck() {
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval);
      this._healthCheckInterval = null;
    }
  }

  async checkHealth(): Promise<BackendHealth | null> {
    this.setStatus('connecting');

    // Try same-origin /api/ first (Vercel serverless)
    const vercelRes = await this._tryFetch('/api/health', 8000);
    if (vercelRes) {
      try {
        const health: BackendHealth = await vercelRes.json();
        this._lastHealth = health;
        this._resolvedBase = '/api';
        this.setStatus(health.databricks ? 'connected' : 'fallback');
        return health;
      } catch { /* parse error, try external */ }
    }

    // Try external backend (localhost:8000 or VITE_API_URL)
    const extRes = await this._tryFetch(`${this._externalUrl}/health`, 5000);
    if (extRes) {
      try {
        const health: BackendHealth = await extRes.json();
        this._lastHealth = health;
        this._resolvedBase = this._externalUrl;
        this.setStatus(health.databricks ? 'connected' : 'fallback');
        return health;
      } catch { /* parse error */ }
    }

    this._lastHealth = null;
    this._resolvedBase = null;
    this.setStatus('disconnected');
    return null;
  }

  async fetchStocks(): Promise<{ stocks: any[]; correlation_edges: any[]; source: string } | null> {
    // Try resolved base first, then both origins
    const urls = this._resolvedBase
      ? [`${this._resolvedBase}/stocks`]
      : ['/api/stocks', `${this._externalUrl}/stocks`];

    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.stocks || data.stocks.length === 0) continue;
        return {
          stocks: data.stocks,
          correlation_edges: data.correlation_edges || [],
          source: data.source || 'backend',
        };
      } catch { /* try next */ }
    }
    return null;
  }

  async triggerAdvance(): Promise<any | null> {
    try {
      const res = await fetch('/api/advance', { signal: AbortSignal.timeout(60000) });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async fetchStocksWithDate(): Promise<{ stocks: any[]; correlation_edges: any[]; source: string; snapshot_date: string } | null> {
    try {
      const res = await fetch('/api/stocks', { signal: AbortSignal.timeout(45000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.stocks || data.stocks.length === 0) return null;
      return {
        stocks: data.stocks,
        correlation_edges: data.correlation_edges || [],
        source: data.source || 'backend',
        snapshot_date: data.snapshot_date || '',
      };
    } catch {
      return null;
    }
  }

  async fetchRegime(): Promise<any | null> {
    const base = this._resolvedBase || this._externalUrl;
    try {
      const res = await fetch(`${base}/regime`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}

export const apiClient = new ApiClient();
