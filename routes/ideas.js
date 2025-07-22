import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * CREATE AN IDEA OR SOLUTION REQUEST
 * POST /api/ideas
 */
router.post('/', authMiddleware, async (req, res) => {
  const { title, description, type, potentialDollarValue } = req.body;
  const authorId = req.user.userId;

  if (!title || !description || !type) {
    return res.status(400).json({ error: 'Title, description, and type are required.' });
  }
  if (type !== 'IDEATION' && type !== 'SOLUTION_REQUEST') {
    return res.status(400).json({ error: "Type must be either 'IDEATION' or 'SOLUTION_REQUEST'." });
  }

  try {
    const newIdea = await prisma.idea.create({
      data: {
        title,
        description,
        type,
        potentialDollarValue,
        authorId: authorId,
      },
    });
    res.status(201).json({ message: "idea created", idea_details: newIdea });
  } catch (error) {
    console.error('Failed to create idea:', error);
    res.status(500).json({ error: 'An error occurred while creating the idea.' });
  }
});

export default router;