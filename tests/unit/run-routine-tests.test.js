'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const runner = require('../../scripts/run-routine-tests.js');

// A fake child_process.spawn()-shaped object. Tests resolve/reject it
// explicitly by calling emitClose(code, signal) or emitError(err); nothing
// here ever launches a real process, npm, or a browser.
function fakeChild() {
  const child = new EventEmitter();
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

// ---- buildPhases() ----

describe('buildPhases', () => {
  test('returns exactly four phases in the required order', () => {
    const phases = runner.buildPhases();
    assert.equal(phases.length, 4);
    assert.deepEqual(phases.map(p => p.name), ['build', 'unit', 'routine-standalone', 'pwa']);
  });

  test('every phase command is a string and every args list is an array of strings', () => {
    for (const phase of runner.buildPhases()) {
      assert.equal(typeof phase.command, 'string', `${phase.name} command`);
      assert.ok(Array.isArray(phase.args), `${phase.name} args`);
      for (const a of phase.args) assert.equal(typeof a, 'string', `${phase.name} arg`);
    }
  });

  test('build and unit phases run "npm run build" / "npm run test:unit"', () => {
    const phases = runner.buildPhases();
    assert.deepEqual(phases[0].args.slice(-2), ['run', 'build']);
    assert.deepEqual(phases[1].args.slice(-2), ['run', 'test:unit']);
  });

  test('standalone phase uses the routine config; pwa phase uses the pwa config', () => {
    const phases = runner.buildPhases();
    assert.ok(phases[2].args.includes('--config=playwright.routine.config.js'), 'routine-standalone config arg');
    assert.ok(phases[3].args.includes('--config=playwright.pwa.config.js'), 'pwa config arg');
    // Neither Playwright phase goes through npm (no "run" verb in its args).
    assert.ok(!phases[2].args.includes('run'));
    assert.ok(!phases[3].args.includes('run'));
  });
});

// ---- runPhase() ----

describe('runPhase', () => {
  test('spawns with shell:false and forwards the phase command/args unchanged', async () => {
    let seen = null;
    const child = fakeChild();
    const spawnFn = (command, args, opts) => {
      seen = { command, args, opts };
      setImmediate(() => child.emit('close', 0, null));
      return child;
    };
    const phase = { name: 'x', command: '/bin/example', args: ['--a', '--b'] };
    const result = await runner.runPhase(phase, spawnFn);

    assert.equal(seen.command, '/bin/example');
    assert.deepEqual(seen.args, ['--a', '--b']);
    assert.equal(seen.opts.shell, false, 'shell must be false');
    assert.ok(Array.isArray(seen.args), 'args must be an array, not a shell string');
    assert.equal(result.ok, true);
  });

  test('extraOpts cannot override shell:false', async () => {
    let seen = null;
    const spawnFn = (command, args, opts) => {
      seen = opts;
      const child = fakeChild();
      setImmediate(() => child.emit('close', 0, null));
      return child;
    };
    await runner.runPhase({ name: 'x', command: 'cmd', args: [] }, spawnFn, { shell: true });
    assert.equal(seen.shell, false);
  });

  test('reports an ordinary nonzero exit code exactly, with kind "exit" and ok:false', async () => {
    const spawnFn = () => {
      const child = fakeChild();
      setImmediate(() => child.emit('close', 42, null));
      return child;
    };
    const result = await runner.runPhase({ name: 'x', command: 'cmd', args: [] }, spawnFn);
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'exit');
    assert.equal(result.code, 42);
    assert.equal(result.signal, null);
  });

  test('reports success (code 0) as ok:true, kind "exit"', async () => {
    const spawnFn = () => {
      const child = fakeChild();
      setImmediate(() => child.emit('close', 0, null));
      return child;
    };
    const result = await runner.runPhase({ name: 'x', command: 'cmd', args: [] }, spawnFn);
    assert.equal(result.ok, true);
    assert.equal(result.kind, 'exit');
    assert.equal(result.code, 0);
  });

  test('reports a synchronous spawn throw as a distinct "spawn-error", ok:false', async () => {
    const boom = new Error('ENOENT: no such executable');
    const spawnFn = () => { throw boom; };
    const result = await runner.runPhase({ name: 'x', command: 'missing', args: [] }, spawnFn);
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'spawn-error');
    assert.equal(result.error, boom);
    assert.equal(result.code, null);
    assert.equal(result.signal, null);
  });

  test('reports an async child "error" event as "spawn-error", ok:false', async () => {
    const boom = new Error('spawn EACCES');
    const spawnFn = () => {
      const child = fakeChild();
      setImmediate(() => child.emit('error', boom));
      return child;
    };
    const result = await runner.runPhase({ name: 'x', command: 'cmd', args: [] }, spawnFn);
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'spawn-error');
    assert.equal(result.error, boom);
  });

  test('reports signal termination distinctly from an ordinary exit, ok:false', async () => {
    const spawnFn = () => {
      const child = fakeChild();
      setImmediate(() => child.emit('close', null, 'SIGTERM'));
      return child;
    };
    const result = await runner.runPhase({ name: 'x', command: 'cmd', args: [] }, spawnFn);
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'signal');
    assert.equal(result.signal, 'SIGTERM');
    assert.equal(result.code, null);
  });

  test('emits a numeric elapsed time for the phase', async () => {
    const spawnFn = () => {
      const child = fakeChild();
      setImmediate(() => child.emit('close', 0, null));
      return child;
    };
    const result = await runner.runPhase({ name: 'x', command: 'cmd', args: [] }, spawnFn);
    assert.equal(typeof result.elapsedMs, 'number');
    assert.ok(result.elapsedMs >= 0);
  });

  // Regression test: Node commonly emits "close" after "error" for a process
  // that never actually started. Before the settled guard, that second event
  // logged a second, contradicting terminal status line (e.g. "PASSED" right
  // after "FAILED (spawn error)"), even though the Promise itself only
  // resolves once.
  test('an "error" followed by a "close" resolves once and logs only one terminal status line', async () => {
    const child = fakeChild();
    const spawnFn = () => {
      setImmediate(() => {
        child.emit('error', new Error('spawn EACCES'));
        child.emit('close', 0, null);
      });
      return child;
    };

    const originalLog = console.log;
    const lines = [];
    console.log = (...args) => { lines.push(args.join(' ')); };
    let result;
    try {
      result = await runner.runPhase({ name: 'x', command: 'missing', args: [] }, spawnFn);
    } finally {
      console.log = originalLog;
    }

    assert.equal(result.ok, false);
    assert.equal(result.kind, 'spawn-error');
    const terminalLines = lines.filter((l) =>
      l.includes('PHASE FAILED') || l.includes('PHASE PASSED') || l.includes('PHASE TERMINATED'));
    assert.equal(terminalLines.length, 1,
      'exactly one terminal phase-status line must be logged, never a contradicting second one');
    assert.match(terminalLines[0], /FAILED \(spawn error\)/);
  });
});

// ---- runAll() ----

describe('runAll', () => {
  function scriptedSpawn(scenario) {
    // scenario: array of {code, signal, error} per call, in call order.
    let call = 0;
    return () => {
      const step = scenario[call++];
      const child = fakeChild();
      setImmediate(() => {
        if (step.error) child.emit('error', step.error);
        else child.emit('close', step.code, step.signal || null);
      });
      return child;
    };
  }

  test('runs all four phases in order when every phase succeeds', async () => {
    const phases = runner.buildPhases();
    const calls = [];
    const spawnFn = (command, args) => {
      calls.push(command);
      const child = fakeChild();
      setImmediate(() => child.emit('close', 0, null));
      return child;
    };
    const result = await runner.runAll(phases, spawnFn);
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 4);
    assert.deepEqual(result.results.map(r => r.phase), ['build', 'unit', 'routine-standalone', 'pwa']);
    assert.ok(result.results.every(r => r.ok));
    assert.equal(typeof result.totalMs, 'number');
  });

  test('stops immediately after the first failed phase; later phases never run', async () => {
    const phases = [
      { name: 'a', command: 'cmd', args: [] },
      { name: 'b', command: 'cmd', args: [] },
      { name: 'c', command: 'cmd', args: [] },
    ];
    const spawnFn = scriptedSpawn([{ code: 0 }, { code: 7 }, { code: 0 }]);
    let calls = 0;
    const countingSpawn = (...a) => { calls++; return spawnFn(...a); };
    const result = await runner.runAll(phases, countingSpawn);

    assert.equal(result.ok, false);
    assert.equal(calls, 2, 'phase "c" must not have been spawned');
    assert.equal(result.failedPhase.phase, 'b');
    assert.equal(result.failedPhase.code, 7);
    assert.equal(result.results.length, 2);
  });

  test('emits a total elapsed time on both the success and the stopped-early path', async () => {
    const okPhases = [{ name: 'a', command: 'cmd', args: [] }];
    const okResult = await runner.runAll(okPhases, scriptedSpawn([{ code: 0 }]));
    assert.equal(typeof okResult.totalMs, 'number');

    const failPhases = [{ name: 'a', command: 'cmd', args: [] }];
    const failResult = await runner.runAll(failPhases, scriptedSpawn([{ code: 1 }]));
    assert.equal(typeof failResult.totalMs, 'number');
    assert.equal(failResult.ok, false);
  });

  // Regression test: a signal arriving in the gap between two phases (after
  // the previous child exited, before the next is spawned) leaves no active
  // child to forward the signal to. Without a between-phase abort check, the
  // pipeline would still start the next phase despite having reported
  // "stopping".
  test('stops before starting the next phase once shouldAbort() reports true, even with no active child', async () => {
    const phases = [
      { name: 'a', command: 'cmd', args: [] },
      { name: 'b', command: 'cmd', args: [] },
    ];
    let calls = 0;
    let aborted = false;
    const spawnFn = () => {
      calls++;
      const child = fakeChild();
      setImmediate(() => child.emit('close', 0, null));
      return child;
    };
    // Simulate the signal landing exactly after phase "a" finishes and
    // before phase "b" would be spawned.
    const wrappedSpawn = (...args) => {
      const child = spawnFn(...args);
      child.once('close', () => { aborted = true; });
      return child;
    };

    const result = await runner.runAll(phases, wrappedSpawn, undefined, () => aborted);

    assert.equal(calls, 1, 'phase "b" must not be spawned once interrupted between phases');
    assert.equal(result.ok, false);
    assert.equal(result.failedPhase.kind, 'aborted');
    assert.equal(result.failedPhase.phase, 'b');
  });

  test('does not abort before the first phase merely because shouldAbort exists and returns false', async () => {
    const phases = runner.buildPhases();
    const calls = [];
    const spawnFn = (command) => {
      calls.push(command);
      const child = fakeChild();
      setImmediate(() => child.emit('close', 0, null));
      return child;
    };
    const result = await runner.runAll(phases, spawnFn, undefined, () => false);
    assert.equal(result.ok, true);
    assert.equal(calls.length, 4);
  });
});

// ---- exitCodeFor() ----

describe('exitCodeFor', () => {
  test('successful run exits 0', () => {
    assert.equal(runner.exitCodeFor({ ok: true, failedPhase: null }), 0);
  });

  test('propagates the exact ordinary nonzero exit code', () => {
    const result = { ok: false, failedPhase: { kind: 'exit', code: 17, signal: null } };
    assert.equal(runner.exitCodeFor(result), 17);
  });

  test('maps SIGINT/SIGTERM to conventional 128+signal codes', () => {
    assert.equal(
      runner.exitCodeFor({ ok: false, failedPhase: { kind: 'signal', signal: 'SIGINT' } }),
      130,
    );
    assert.equal(
      runner.exitCodeFor({ ok: false, failedPhase: { kind: 'signal', signal: 'SIGTERM' } }),
      143,
    );
  });

  test('falls back to a nonzero code for spawn errors and unrepresentable signals', () => {
    assert.notEqual(
      runner.exitCodeFor({ ok: false, failedPhase: { kind: 'spawn-error' } }),
      0,
    );
    assert.notEqual(
      runner.exitCodeFor({ ok: false, failedPhase: { kind: 'signal', signal: 'SIGUSR2' } }),
      0,
    );
  });

  test('falls back to a nonzero code for a between-phase abort', () => {
    assert.notEqual(
      runner.exitCodeFor({ ok: false, failedPhase: { kind: 'aborted' } }),
      0,
    );
  });
});

// ---- taskkillSucceeded() ----
//
// Regression coverage for a review finding: spawnSync() returns normally
// even when the command it ran failed or could not be found -- that is
// reported through the result object's error/status/signal fields, not a
// thrown exception. The Windows process-tree-kill fallback must actually
// inspect the result rather than assuming success just because spawnSync()
// didn't throw, or a failed cleanup could go unnoticed and skip the direct
// child.kill() fallback entirely. These tests exercise the decision in
// isolation, without requiring Windows or a real taskkill binary.
describe('taskkillSucceeded', () => {
  test('true for a clean exit (status 0, no error)', () => {
    assert.equal(runner.taskkillSucceeded({ error: undefined, status: 0, signal: null }), true);
  });

  test('false when taskkill reports a nonzero exit status', () => {
    // e.g. taskkill's own "process not found" (128) or general failure (1).
    assert.equal(runner.taskkillSucceeded({ error: undefined, status: 1, signal: null }), false);
    assert.equal(runner.taskkillSucceeded({ error: undefined, status: 128, signal: null }), false);
  });

  test('false when spawnSync could not run taskkill at all', () => {
    assert.equal(
      runner.taskkillSucceeded({ error: new Error('ENOENT'), status: null, signal: null }),
      false,
    );
  });

  test('false when taskkill was itself terminated by a signal', () => {
    assert.equal(
      runner.taskkillSucceeded({ error: undefined, status: null, signal: 'SIGKILL' }),
      false,
    );
  });

  test('false for a missing or empty result', () => {
    assert.equal(runner.taskkillSucceeded(undefined), false);
    assert.equal(runner.taskkillSucceeded(null), false);
    assert.equal(runner.taskkillSucceeded({}), false);
  });
});

// ---- Real-process signal forwarding and cleanup (no npm/browser involved) ----
//
// Spawns the actual runner script as a real child process, using the
// ROUTINE_RUNNER_TEST_PHASES escape hatch to substitute a trivial, short-lived
// `node -e` sleep in place of npm/Playwright. This exercises the real
// SIGINT-handling code path in `require.main === module`, which the
// injected-spawn tests above intentionally do not reach.
describe('signal forwarding (real child process, no npm/browser)', () => {
  test('SIGINT is forwarded to the active phase, the run does not report success, and the child is no longer running', async () => {
    const sleepScript = 'const t = setInterval(() => {}, 1000); process.on("SIGINT", () => { clearInterval(t); process.exit(99); });';
    const phases = [
      { name: 'sleep', command: process.execPath, args: ['-e', sleepScript] },
    ];

    const child = spawn(process.execPath, [path.join(__dirname, '../../scripts/run-routine-tests.js')], {
      cwd: path.join(__dirname, '../..'),
      env: Object.assign({}, process.env, { ROUTINE_RUNNER_TEST_PHASES: JSON.stringify(phases) }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

    await new Promise((resolve) => setTimeout(resolve, 300));
    child.kill('SIGINT');

    const exitInfo = await new Promise((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }));
    });

    // The runner must not report success after being interrupted -- exactly
    // the conventional 128+SIGINT code, regardless of what exit code the
    // forwarded-to child itself happened to report -- and it must have
    // logged that it received and forwarded the signal.
    assert.equal(exitInfo.code, 130, 'an interrupted run must report the conventional SIGINT exit code, not success');
    assert.match(stdout, /Received SIGINT/);
  });

  // Regression test for the P2 finding that forwarding a signal only to the
  // immediate phase process leaves its descendants running. This phase
  // spawns its own grandchild process (writing that grandchild's pid to a
  // file so the test can check on it independently), modeling an npm phase
  // with a Node process beneath it or Playwright's worker/browser
  // descendants. After SIGINT, the whole tree -- not just the immediate
  // child -- must be gone.
  test('SIGINT terminates the whole phase process tree, not just its immediate child', async () => {
    const pidFile = path.join(
      os.tmpdir(),
      `routine-runner-test-grandchild-${process.pid}-${Date.now()}.pid`,
    );
    const parentScript = [
      "const { spawn } = require('child_process');",
      "const fs = require('fs');",
      "const gc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], { stdio: 'ignore' });",
      "fs.writeFileSync(process.env.ROUTINE_TEST_PIDFILE, String(gc.pid));",
      "setInterval(() => {}, 1000);",
    ].join(' ');
    const phases = [
      { name: 'tree', command: process.execPath, args: ['-e', parentScript] },
    ];

    const child = spawn(process.execPath, [path.join(__dirname, '../../scripts/run-routine-tests.js')], {
      cwd: path.join(__dirname, '../..'),
      env: Object.assign({}, process.env, {
        ROUTINE_RUNNER_TEST_PHASES: JSON.stringify(phases),
        ROUTINE_TEST_PIDFILE: pidFile,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      const grandchildPid = await waitForPidFile(pidFile, 3000);

      child.kill('SIGINT');
      const exitInfo = await new Promise((resolve) => {
        child.on('close', (code, signal) => resolve({ code, signal }));
      });
      assert.equal(exitInfo.code, 130);

      if (process.platform !== 'win32') {
        const gone = await processIsGone(grandchildPid, 2000);
        assert.equal(gone, true,
          'the grandchild process must be terminated too, not just the immediate phase process');
      }
    } finally {
      try { fs.unlinkSync(pidFile); } catch (e) { /* already gone, or never written */ }
    }
  });
});

// Polls for a pidfile a spawned test fixture writes once its own grandchild
// is running, so the test does not race the fixture's own startup.
function waitForPidFile(file, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      if (fs.existsSync(file)) {
        const pid = Number(fs.readFileSync(file, 'utf8').trim());
        if (Number.isInteger(pid) && pid > 0) {
          resolve(pid);
          return;
        }
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('grandchild pidfile did not appear in time'));
        return;
      }
      setTimeout(poll, 25);
    })();
  });
}

// Polls process.kill(pid, 0) (which throws ESRCH once a process is gone)
// until the process disappears or the timeout elapses. Termination is not
// instantaneous, so a single check right after sending the signal would be
// flaky.
function processIsGone(pid, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    (function poll() {
      try {
        process.kill(pid, 0);
      } catch (e) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, 50);
    })();
  });
}
