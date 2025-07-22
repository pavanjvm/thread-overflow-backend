import express from 'express';
import 'dotenv/config';
import authRouter from './routes/authRoutes.js';
import ideationRoutes from './routes/ideationRoutes.js';

// --- INITIALIZATION ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(express.json());



app.use('/api/auth', authRouter);
app.use('/api/ideas',ideationRoutes);

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});