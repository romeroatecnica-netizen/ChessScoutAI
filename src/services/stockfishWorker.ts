export interface EngineEvalResult {
  bestMoveUci: string | null;
  evalCpWhite: number; // Centipawns from White's perspective
  mateWhite: number | null; // Positive = White mates, Negative = Black mates
  depth: number;
}

interface PendingJob {
  fen: string;
  depth: number;
  movetimeMs?: number;
  resolve: (result: EngineEvalResult) => void;
  reject: (err: Error) => void;
}

function isWasmSupported(): boolean {
  try {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function') {
      return WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
    }
  } catch {
    return false;
  }
  return false;
}

class StockfishEngineClient {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private queue: PendingJob[] = [];
  private activeJob: PendingJob | null = null;
  private latestScoreCp = 0;
  private latestMate: number | null = null;
  private latestDepth = 0;
  private jobTimeoutId: number | null = null;

  private ensureWorker(): Promise<void> {
    if (this.worker && this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      try {
        const scriptPath = isWasmSupported()
          ? '/engine/stockfish.wasm.js'
          : '/engine/stockfish.js';
        const worker = new Worker(scriptPath);
        this.worker = worker;

        let uciOk = false;
        let resolved = false;

        const initTimeout = window.setTimeout(() => {
          if (!resolved) {
            resolved = true;
            reject(new Error('Stockfish worker initialization timed out'));
          }
        }, 12000);

        worker.onmessage = (event: MessageEvent<string>) => {
          const line = typeof event.data === 'string' ? event.data.trim() : '';
          if (!line) return;

          if (!uciOk && line === 'uciok') {
            uciOk = true;
            worker.postMessage('isready');
            return;
          }

          if (!resolved && line === 'readyok') {
            resolved = true;
            window.clearTimeout(initTimeout);
            resolve();
            return;
          }

          this.handleEngineLine(line);
        };

        worker.onerror = () => {
          window.clearTimeout(initTimeout);
          if (!resolved) {
            resolved = true;
            reject(new Error('Failed to load Stockfish Web Worker'));
          }
          this.resetWorker();
        };

        worker.postMessage('uci');
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Worker error'));
      }
    });

    return this.readyPromise;
  }

  private resetWorker(): void {
    if (this.jobTimeoutId !== null) {
      window.clearTimeout(this.jobTimeoutId);
      this.jobTimeoutId = null;
    }
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.readyPromise = null;
    if (this.activeJob) {
      this.activeJob.resolve({
        bestMoveUci: null,
        evalCpWhite: 0,
        mateWhite: null,
        depth: 0,
      });
      this.activeJob = null;
    }
    this.drainQueue();
  }

  private handleEngineLine(line: string): void {
    if (!this.activeJob) return;

    if (line.startsWith('info ')) {
      const depthMatch = line.match(/\bdepth\s+(\d+)/);
      if (depthMatch) {
        this.latestDepth = parseInt(depthMatch[1], 10);
      }
      const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
      if (mateMatch) {
        const mateRaw = parseInt(mateMatch[1], 10);
        this.latestMate = mateRaw;
        this.latestScoreCp = mateRaw > 0 ? 1500 - mateRaw * 10 : -1500 - mateRaw * 10;
      } else {
        const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
        if (cpMatch) {
          this.latestMate = null;
          this.latestScoreCp = parseInt(cpMatch[1], 10);
        }
      }
      return;
    }

    if (line.startsWith('bestmove')) {
      if (this.jobTimeoutId !== null) {
        window.clearTimeout(this.jobTimeoutId);
        this.jobTimeoutId = null;
      }
      const parts = line.split(/\s+/);
      const rawMove = parts[1];
      const bestMoveUci = rawMove && rawMove !== '(none)' ? rawMove : null;

      const job = this.activeJob;
      this.activeJob = null;

      const sideToMove = job.fen.split(' ')[1] || 'w';
      const sign = sideToMove === 'b' ? -1 : 1;

      job.resolve({
        bestMoveUci,
        evalCpWhite: this.latestScoreCp * sign,
        mateWhite: this.latestMate !== null ? this.latestMate * sign : null,
        depth: this.latestDepth || job.depth,
      });

      this.drainQueue();
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.activeJob || this.queue.length === 0) return;

    const next = this.queue.shift()!;
    try {
      await this.ensureWorker();
      if (!this.worker) {
        next.resolve({bestMoveUci: null, evalCpWhite: 0, mateWhite: null, depth: 0});
        this.drainQueue();
        return;
      }

      this.activeJob = next;
      this.latestScoreCp = 0;
      this.latestMate = null;
      this.latestDepth = 0;

      const timeoutMs = next.movetimeMs ? next.movetimeMs + 3500 : 7500;
      this.jobTimeoutId = window.setTimeout(() => {
        if (this.activeJob === next && this.worker) {
          this.worker.postMessage('stop');
        }
      }, timeoutMs);

      this.worker.postMessage(`position fen ${next.fen}`);
      if (next.movetimeMs) {
        this.worker.postMessage(`go depth ${next.depth} movetime ${next.movetimeMs}`);
      } else {
        this.worker.postMessage(`go depth ${next.depth}`);
      }
    } catch {
      next.resolve({bestMoveUci: null, evalCpWhite: 0, mateWhite: null, depth: 0});
      this.activeJob = null;
      this.drainQueue();
    }
  }

  public evaluatePosition(
    fen: string,
    depth = 10,
    movetimeMs?: number
  ): Promise<EngineEvalResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({fen, depth, movetimeMs, resolve, reject});
      void this.drainQueue();
    });
  }

  public clearQueue(): void {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      job?.resolve({bestMoveUci: null, evalCpWhite: 0, mateWhite: null, depth: 0});
    }
  }
}

export const stockfishEngine = new StockfishEngineClient();
