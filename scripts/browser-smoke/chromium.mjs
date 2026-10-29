import { spawn } from 'node:child_process';

/** Minimal CDP pipe client: no browser-driver dependency or debugging TCP port. */
export class Chromium {
  pending = new Map();
  exceptions = [];
  sequence = 0;
  buffer = '';
  sessionId;

  constructor(executable, profile, noSandbox = false) {
    const args = [
      '--headless',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      'about:blank',
    ];
    if (noSandbox) {
      args.push('--no-sandbox');
    }
    this.process = spawn(executable, args, {
      stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
    });
    this.diagnostics = '';
    this.process.stderr.on('data', chunk => {
      this.diagnostics += String(chunk);
    });
    this.process.on('error', error => {
      this.fail(error);
    });
    this.process.on('exit', code => {
      this.fail(
        new Error(`Chromium exited (${code}): ${this.diagnostics.slice(-2000)}`)
      );
    });
    this.process.stdio[4].on('data', chunk => {
      this.receive(String(chunk));
    });
  }

  receive(chunk) {
    this.buffer += chunk;
    let boundary;
    while ((boundary = this.buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(this.buffer.slice(0, boundary));
      this.buffer = this.buffer.slice(boundary + 1);
      const waiting = this.pending.get(message.id);
      if (waiting) {
        this.pending.delete(message.id);
        clearTimeout(waiting.timer);
        if (message.error) {
          waiting.reject(new Error(JSON.stringify(message.error)));
        } else {
          waiting.resolve(message.result);
        }
      }
      if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(message.params.exceptionDetails);
      }
    }
  }

  fail(error) {
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }

  call(method, params = {}, sessionId = this.sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `CDP timed out: ${method}. ${this.diagnostics.slice(-1000)}`
          )
        );
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdio[3].write(
        JSON.stringify({ id, method, params, sessionId }) + '\0'
      );
    });
  }

  async initialize() {
    await this.call('Browser.getVersion');
    const { targetId } = await this.call('Target.createTarget', {
      url: 'about:blank',
    });
    const attached = await this.call('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    this.sessionId = attached.sessionId;
    await this.call('Runtime.enable');
    await this.call('Page.enable');
    await this.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }

  async close() {
    if (
      this.process.exitCode !== null ||
      this.process.signalCode !== null ||
      this.process.pid === undefined
    ) {
      return;
    }
    const exited = new Promise(resolve => {
      this.process.once('exit', resolve);
    });
    this.process.kill();
    const kill = setTimeout(() => {
      this.process.kill('SIGKILL');
    }, 3000);
    await exited;
    clearTimeout(kill);
  }
}
