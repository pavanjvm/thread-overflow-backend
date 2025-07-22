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

// gets all the proposals of particular ideaid
router.get('/:id/proposals', async (req, res) => {
  const ideaId = parseInt(req.params.id);

  try {
    const proposalsForIdea = await prisma.proposal.findMany({
      // Find all proposals...
      where: {
        // ...where the related subIdea's ideaId matches the ID from the URL.
        subIdea: {
          ideaId: ideaId,
        },
      },
      orderBy: {
        createdAt: 'desc', // Show newest proposals first
      },
      include: {
        // Include details about the author of each proposal
        author: {
          select: {
            name: true,
            avatarUrl: true,
          },
        },
        // Also include which sub-idea the proposal belongs to for context
        subIdea: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(200).json(proposalsForIdea);
  } catch (error) {
    console.error(`Failed to fetch proposals for idea ${ideaId}:`, error);
    res.status(500).json({ error: 'An error occurred while fetching proposals.' });
  }
});
export default router;