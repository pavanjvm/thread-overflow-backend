import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();


router.post('/submit/:proposalId', authMiddleware, async (req, res) => {
  const proposalId = parseInt(req.params.proposalId);
  const { title, description, imageUrl, liveUrl } = req.body;
  const authorId = req.user.userId;

  if (!title || !description || !imageUrl) {
    return res.status(400).json({ error: 'Title, description, and imageUrl are required.' });
  }

  try {
    // 1. Find the great-grandparent Idea's ID by traversing the relations
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        status: true,
        subIdea: {
          select: {
            ideaId: true, // Get the ideaId from the parent SubIdea
          },
        },
      },
    });

    if (proposal.status !== 'ACCEPTED') {
      return res.status(403).json({ error: 'Forbidden: Prototypes can only be created for accepted proposals.' });
    }

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found.' });
    }
    const ideaId = proposal.subIdea.ideaId;

    // 2. Use a transaction to do both actions at once
    const [newPrototype] = await prisma.$transaction([
      // Action A: Create the new prototype
      prisma.prototype.create({
        data: {
          title,
          description,
          imageUrl,
          liveUrl,
          author: { connect: { id: authorId } },
          proposal: { connect: { id: proposalId } },
        },
      }),
      // Action B: Increment the counter on the parent Idea
      prisma.idea.update({
        where: { id: ideaId },
        data: {
          totalPrototypes: {
            increment: 1,
          },
        },
      }),
    ]);

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