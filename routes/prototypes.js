import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();

//creat a prototype for a proposal
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

//get all prototypes for that particular idea id
router.get('/:id/prototypes', async (req, res) => {
  const ideaId = parseInt(req.params.id);

  try {
    const prototypesForIdea = await prisma.prototype.findMany({
      // This is a deep relation filter: find all prototypes...
      where: {
        // ...where the related proposal's...
        proposal: {
          // ...related subIdea's...
          subIdea: {
            // ...ideaId matches our ideaId.
            ideaId: ideaId,
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Show newest prototypes first
      },
      include: {
        // Include details about the author of each prototype
        author: {
          select: {
            name: true,
            avatarUrl: true,
          },
        },
        // Also include which proposal the prototype belongs to for context
        proposal: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.status(200).json(prototypesForIdea);
  } catch (error) {
    console.error(`Failed to fetch prototypes for idea ${ideaId}:`, error);
    res.status(500).json({ error: 'An error occurred while fetching prototypes.' });
  }
});

export default router;