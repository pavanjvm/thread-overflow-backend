import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();


router.post('/submit/:proposalId', authMiddleware, async (req, res) => {
  const { proposalId } = req.params;
  const { title, description, imageUrl, liveUrl } = req.body;
  const authorId = req.user.userId;

  if (!title || !description || !imageUrl) {
    return res.status(400).json({ error: 'Title, description, and imageUrl are required.' });
  }

  try {
    const newPrototype = await prisma.prototype.create({
      data: {
        title,
        description,
        imageUrl,
        liveUrl,
        author: { connect: { id: authorId } },
        proposal: { connect: { id: parseInt(proposalId) } },
      },
    });
    res.status(201).json(newPrototype);
  } catch (error) {
    console.error('Failed to create prototype:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Proposal not found.' });
    }
    res.status(500).json({ error: 'An error occurred while creating the prototype.' });
  }
});

export default router;