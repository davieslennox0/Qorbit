import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import arcRouter from './routes/arc.js';
import paymentsRouter from './routes/payments.js';
import quantumRouter from './routes/quantum.js';
import wellKnownRouter from './routes/wellKnown.js';
import { warmPool } from './services/qrng.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'qorbitpay-backend' });
});

app.use('/api/arc', arcRouter);
app.use('/api', paymentsRouter);
app.use('/api', quantumRouter);
app.use('/.well-known', wellKnownRouter);

app.listen(PORT, () => {
  console.log(`Qorbitpay backend listening on port ${PORT}`);
  warmPool();
});
