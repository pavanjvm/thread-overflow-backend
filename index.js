import express from 'express';
import 'dotenv/config';
import authRouter from './routes/auth.js';
import ideationRoutes from './routes/ideas.js';
import proposalsRouter from './routes/proposals.js';   // 1. Import proposals router
import prototypesRouter from './routes/prototypes.js';

// --- INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(express.json());



app.use('/api/auth', authRouter);
app.use('/api/ideas',ideationRoutes);
app.use('/api/proposals',proposalsRouter);
app.use('/api/prototypes',prototypesRouter);

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});