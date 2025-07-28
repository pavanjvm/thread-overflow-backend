import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import 'dotenv/config';
import authRouter from './routes/auth.js';
import ideationRoutes from './routes/ideas.js';
import proposalsRouter from './routes/proposals.js';   // 1. Import proposals router
import prototypesRouter from './routes/prototypes.js';
import subideaRouter from './routes/subideas.js';
import profileRouter from './routes/profile.js';

// --- INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cookieParser());
// --- MIDDLEWARE ---
app.use(express.json());


app.use(cors({
  origin: 'http://localhost:9002', // ✅ allow your frontend
  credentials: true                // ✅ if using cookies/auth
}));
app.use('/api/auth', authRouter);
app.use('/api/ideas',ideationRoutes);
app.use('/api/proposals',proposalsRouter);
app.use('/api/prototypes',prototypesRouter);
app.use('/api/subidea', subideaRouter);
app.use('/api/profile', profileRouter);
// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});