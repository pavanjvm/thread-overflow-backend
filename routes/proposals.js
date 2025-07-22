import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();


router.post('/submit/:subIdeaId', authMiddleware, async (req, res) => {
  const { subIdeaId } = req.params;
  const { title, description, presentationUrl } = req.body;
  const authorId = req.user.userId;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required.' });
  }

  try {
    const newProposal = await prisma.proposal.create({
      data: {
        title,
        description,
        presentationUrl,
        author: { connect: { id: authorId } },
        subIdea: { connect: { id: parseInt(subIdeaId) } },
      },
    });
    res.status(201).json(newProposal);
  } catch (error) {
    console.error('Failed to create proposal:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Sub-idea not found.' });
    }
    res.status(500).json({ error: 'An error occurred while creating the proposal.' });
  }
});

export default router;