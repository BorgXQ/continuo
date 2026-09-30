import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import { app, ipcMain, type WebContents } from 'electron';
import type { AnalysisEvent, AnalysisResult } from '../shared/analysis';
import { validateAnalysisDuration } from '../shared/analysis';
import { isAudioFile } from '../shared/audioFormats';
import { CONVERSION_ERROR, decodeWithElectron } from './analysisDecoder';

interface Job { id: string; path: string; duration: number; size: number; modified: number; owner: WebContents; cancelled: boolean }

export function registerAnalysis(): void {
  const queue: Job[] = [];
  let active: { job: Job; controller: AbortController } | null = null;
  let quitting = false;
  const temporaryRoot = join(app.getPath('userData'), 'analysis-temporary');
  // This dedicated directory contains only disposable WAVs, including crash leftovers.
  rmSync(temporaryRoot, { recursive: true, force: true });
  mkdirSync(temporaryRoot, { recursive: true });

  function send(job: Job, update: AnalysisEvent) {
    if (!job.owner.isDestroyed()) job.owner.send('analysis:update', update);
  }

  function terminate(child: ChildProcess) {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      killer.on('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  }

  function runWorker(job: Job, path: string, signal: AbortSignal): Promise<AnalysisResult | null> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
      const localPython = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      const python = process.env.CONTINUO_PYTHON || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
      const bundled = app.isPackaged && process.platform === 'win32';
      const executable = bundled ? join(root, 'continuo-analysis', 'continuo-analysis.exe') : python;
      const args = bundled ? [path, String(job.duration)] : ['-B', '-u', '-m', 'src.analysis_worker', path, String(job.duration)];
      const child = spawn(executable, args, {
        cwd: root,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' },
      });
      const abort = () => terminate(child);
      signal.addEventListener('abort', abort, { once: true });
      send(job, { id: job.id, state: 'running', progress: 0, stage: 'Starting Python' });
      let result: AnalysisResult | undefined;
      let failure = '';
      let needsDecode = false;
      let stderr = '';
      const lines = createInterface({ input: child.stdout! });
      child.stderr!.on('data', data => { stderr = (stderr + data.toString()).slice(-4000); });
      lines.on('line', line => {
        if (job.cancelled) return;
        try {
          const message = JSON.parse(line);
          if (message.state === 'running' && Number.isFinite(message.progress)) {
            send(job, { id: job.id, state: 'running', progress: Math.max(0, Math.min(99, message.progress)), stage: String(message.stage) });
          } else if (message.state === 'complete') result = message.result;
          else if (message.state === 'decode_required') needsDecode = true;
          else if (message.state === 'failed') failure = String(message.message);
        } catch { failure = 'Invalid response from the analysis worker.'; }
      });
      child.on('error', error => {
        failure = bundled ? `Cannot start bundled analysis: ${error.message}. Reinstall Continuo.`
          : `Cannot start Python analysis: ${error.message}. Check CONTINUO_PYTHON and requirements.txt.`;
      });
      child.on('close', code => {
        lines.close();
        signal.removeEventListener('abort', abort);
        if (signal.aborted) reject(new Error('Analysis cancelled.'));
        else if (code === 0 && result && !failure) resolve(result);
        else if (code === 2 && needsDecode && !failure) resolve(null);
        else reject(new Error(failure || stderr.trim() || `Analysis worker exited (${code}).`));
      });
    });
  }

  function checkSource(job: Job) {
    const stat = statSync(job.path);
    if (!stat.isFile() || stat.size !== job.size || stat.mtimeMs !== job.modified) {
      throw new Error('The audio file changed during analysis. Locate it again before retrying.');
    }
  }

  async function advance() {
    if (active || quitting) return;
    const job = queue.shift();
    if (!job) return;
    if (job.cancelled || job.owner.isDestroyed()) { void advance(); return; }
    const controller = new AbortController();
    active = { job, controller };
    let directory: string | undefined;
    try {
      checkSource(job);
      let result = await runWorker(job, job.path, controller.signal);
      if (result === null) {
        controller.signal.throwIfAborted();
        checkSource(job);
        send(job, { id: job.id, state: 'running', progress: 2, stage: 'Decoding audio with Electron' });
        directory = mkdtempSync(join(temporaryRoot, 'job-'));
        const wav = join(directory, 'decoded.wav');
        try { await decodeWithElectron(job.path, job.duration, wav, controller.signal); }
        catch { throw new Error(CONVERSION_ERROR); }
        checkSource(job);
        result = await runWorker(job, wav, controller.signal);
        if (result === null) throw new Error(CONVERSION_ERROR);
      }
      checkSource(job);
      if (!job.cancelled) send(job, { id: job.id, state: 'complete', result });
    } catch (error) {
      if (!job.cancelled) send(job, { id: job.id, state: 'failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      try {
        if (directory) rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (error) { console.error('Cannot remove temporary analysis audio:', error); }
      active = null;
      if (quitting) app.quit();
      else void advance();
    }
  }

  function cancel(owner: WebContents, id?: string) {
    for (let index = queue.length - 1; index >= 0; index--) {
      const job = queue[index];
      if (job.owner === owner && (id === undefined || job.id === id)) {
        queue.splice(index, 1);
        job.cancelled = true;
        send(job, { id: job.id, state: 'cancelled' });
      }
    }
    if (active?.job.owner === owner && (id === undefined || active.job.id === id)) {
      active.job.cancelled = true;
      send(active.job, { id: active.job.id, state: 'cancelled' });
      active.controller.abort();
    }
  }

  const watched = new WeakSet<WebContents>();
  ipcMain.handle('analysis:start', (event, id: unknown, path: unknown, duration: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Analysis requests must come from the main window.');
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid analysis ID.');
    if (typeof path !== 'string' || !isAbsolute(path) || !isAudioFile(path) || !existsSync(path)) throw new Error('The original audio file is missing or unavailable.');
    validateAnalysisDuration(duration);
    if (queue.some(job => job.owner === event.sender && job.id === id) || (active?.job.owner === event.sender && active.job.id === id)) throw new Error('Analysis is already queued.');
    if (!watched.has(event.sender)) {
      watched.add(event.sender);
      event.sender.once('destroyed', () => cancel(event.sender));
      event.sender.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) cancel(event.sender);
      });
    }
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error('The audio file is unavailable.');
    const job = { id, path, duration, size: stat.size, modified: stat.mtimeMs, owner: event.sender, cancelled: false };
    queue.push(job);
    send(job, { id, state: 'queued', progress: 0, stage: 'Queued' });
    void advance();
  });
  ipcMain.handle('analysis:cancel', (event, id: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof id !== 'string') throw new Error('Invalid cancellation request.');
    cancel(event.sender, id);
  });
  app.on('before-quit', event => {
    quitting = true;
    queue.length = 0;
    if (active) {
      event.preventDefault();
      active.job.cancelled = true;
      active.controller.abort();
    }
  });
}
