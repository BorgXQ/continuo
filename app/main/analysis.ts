import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createInterface } from 'node:readline';
import { app, ipcMain, type WebContents } from 'electron';
import type { AnalysisEvent, AnalysisResult } from '../shared/analysis';

interface Job { id: string; path: string; owner: WebContents; cancelled: boolean }

export function registerAnalysis(): void {
  const queue: Job[] = [];
  let active: { job: Job; child: ChildProcess } | null = null;
  let quitting = false;

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

  function advance() {
    if (active || quitting) return;
    const job = queue.shift();
    if (!job) return;
    if (job.cancelled || job.owner.isDestroyed()) { advance(); return; }
    const root = app.isPackaged ? process.resourcesPath : app.getAppPath();
    const localPython = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.CONTINUO_PYTHON || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
    const bundled = app.isPackaged && process.platform === 'win32';
    const executable = bundled ? join(root, 'continuo-analysis', 'continuo-analysis.exe') : python;
    const args = bundled ? [job.path] : ['-B', '-u', '-m', 'src.analysis_worker', job.path];
    const child = spawn(executable, args, {
      cwd: root,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' },
    });
    active = { job, child };
    send(job, { id: job.id, state: 'running', progress: 0, stage: 'Starting Python' });
    let result: AnalysisResult | undefined;
    let failure = '';
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
        else if (message.state === 'failed') failure = String(message.message);
      } catch { failure = 'Invalid response from the analysis worker.'; }
    });
    child.on('error', error => {
      failure = bundled ? `Cannot start bundled analysis: ${error.message}. Reinstall Continuo.`
        : `Cannot start Python analysis: ${error.message}. Check CONTINUO_PYTHON and requirements.txt.`;
    });
    child.on('close', code => {
      lines.close();
      if (!job.cancelled && !job.owner.isDestroyed()) {
        if (code === 0 && result && !failure) send(job, { id: job.id, state: 'complete', result });
        else send(job, { id: job.id, state: 'failed', message: failure || stderr.trim() || `Analysis worker exited (${code}).` });
      }
      active = null;
      advance();
    });
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
      terminate(active.child);
    }
  }

  const watched = new WeakSet<WebContents>();
  ipcMain.handle('analysis:start', (event, id: unknown, path: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Analysis requests must come from the main window.');
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid analysis ID.');
    if (typeof path !== 'string' || !isAbsolute(path) || !/\.mp3$/i.test(path) || !existsSync(path)) throw new Error('The original MP3 is missing or unavailable.');
    if (queue.some(job => job.owner === event.sender && job.id === id) || (active?.job.owner === event.sender && active.job.id === id)) throw new Error('Analysis is already queued.');
    if (!watched.has(event.sender)) {
      watched.add(event.sender);
      event.sender.once('destroyed', () => cancel(event.sender));
      event.sender.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) cancel(event.sender);
      });
    }
    const job = { id, path, owner: event.sender, cancelled: false };
    queue.push(job);
    send(job, { id, state: 'queued', progress: 0, stage: 'Queued' });
    advance();
  });
  ipcMain.handle('analysis:cancel', (event, id: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof id !== 'string') throw new Error('Invalid cancellation request.');
    cancel(event.sender, id);
  });
  app.on('before-quit', () => {
    quitting = true;
    queue.length = 0;
    if (active) { active.job.cancelled = true; terminate(active.child); }
  });
}
