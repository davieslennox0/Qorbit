// pm2 process manager config. Run from the repo root: `pm2 start ecosystem.config.js`.
//
// Note: VQC/QAOA (quantum-services/quantum/vqc.py, qaoa.py) are NOT served by the
// quantum-services FastAPI app below - the backend spawns them directly per-request via
// python-shell (see backend/src/services/quantumBridge.js). quantum-services here is just
// a small standalone health/status process, kept running for ops visibility.
module.exports = {
  apps: [
    {
      name: 'qorbitpay-backend',
      cwd: './backend',
      script: 'src/server.js',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'qorbitpay-quantum-services',
      cwd: './quantum-services',
      script: '.venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8010',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'qorbitpay-activity-sim',
      cwd: './backend',
      script: 'scripts/simulate-activity.js',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'qorbitpay-billing-cron',
      cwd: './backend',
      script: 'scripts/billing-cron.js',
      env: {
        NODE_ENV: 'production',
        BILLING_INTERVAL_MS: '60000',
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
