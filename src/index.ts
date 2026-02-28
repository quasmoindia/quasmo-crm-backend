import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import routes from './routes/index.js';
import { seedRolesIfNeeded } from './scripts/seedRoles.js';
import { seedUsersIfNeeded } from './scripts/seedUsers.js';
import { seedLeadsIfNeeded } from './scripts/seedLeads.js';
import { loadRoleCache } from './services/roleCache.js';

await connectDB();
await seedRolesIfNeeded();
await seedUsersIfNeeded();
await seedLeadsIfNeeded();
await loadRoleCache();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Test endpoint: GET / shows backend is running
app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'running',
    message: 'Backend is running',
    service: 'Quasmo CRM API',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', routes);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Quasmo CRM API' });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
