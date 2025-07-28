import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();
router.use(authMiddleware);

router.get('/me', authMiddleware, async (req, res) => {
  try {
    // The user ID is added to `req.user` by the authMiddleware
    // NOTE: This assumes your JWT payload contains the user's ID, e.g., { id: 1, ... }
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true, // You can include email for the user themselves
        avatarUrl: true,
        role: true,
      },
    });

    if (!user) {
      // This case is unlikely if the JWT is valid but good practice
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json(user);

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

export default router;