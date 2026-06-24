import path from 'path';
import { PythonShell } from 'python-shell';

const PYTHON_PATH = process.env.QUANTUM_PYTHON_PATH || '../quantum-services/.venv/bin/python3';
const SCRIPTS_DIR = process.env.QUANTUM_SCRIPTS_DIR || '../quantum-services/quantum';
const TIMEOUT_MS = Number(process.env.QUANTUM_BRIDGE_TIMEOUT_MS || 30_000);

/// Spawns `scriptName` (vqc.py / qaoa.py) under quantum-services' venv, sends one JSON
/// payload on stdin, and resolves with the one JSON object the script prints to stdout.
/// Each call is a fresh process - these scripts are short-lived, one-shot computations,
/// not long-running services, so there's no persistent process pool to manage.
function runPythonScript(scriptName, payload) {
  return new Promise((resolve, reject) => {
    const shell = new PythonShell(scriptName, {
      mode: 'json',
      pythonPath: PYTHON_PATH,
      pythonOptions: ['-u'],
      scriptPath: path.resolve(SCRIPTS_DIR),
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      shell.kill();
      reject(new Error(`${scriptName} timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    let result = null;
    shell.on('message', (message) => {
      result = message;
    });
    shell.on('stderr', (line) => {
      console.error(`[${scriptName}] ${line}`);
    });

    shell.send(payload);
    shell.end((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) return reject(err);
      if (!result) return reject(new Error(`${scriptName} produced no output`));
      if (result.error) return reject(new Error(`${scriptName} error: ${result.error}`));
      resolve(result);
    });
  });
}

function runVqcFraudCheck(features) {
  return runPythonScript('vqc.py', features);
}

function runQaoaRouter(providers) {
  return runPythonScript('qaoa.py', { providers });
}

export { runVqcFraudCheck, runQaoaRouter };
