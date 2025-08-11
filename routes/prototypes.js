import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();
router.use(authMiddleware);

// Create a prototype for a proposal
router.post('/submit/:proposalId', async (req, res) => {
  const proposalId = parseInt(req.params.proposalId);
  const { title, description, imageUrl, liveUrl, team = [] } = req.body;
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

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found.' });
    }

    if (proposal.status !== 'ACCEPTED') {
      return res.status(403).json({ error: 'Forbidden: Prototypes can only be created for accepted proposals.' });
    }

    const ideaId = proposal.subIdea.ideaId;

    // Validate team member user IDs exist
    if (team.length > 0) {
      const teamUserIds = team.map(userId => {
        // Handle both "user-1" string format and direct number format
        if (typeof userId === 'string' && userId.startsWith('user-')) {
          return parseInt(userId.replace('user-', ''));
        }
        return parseInt(userId);
      });
      
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: teamUserIds } },
        select: { id: true }
      });
      
      if (existingUsers.length !== teamUserIds.length) {
        return res.status(400).json({ error: 'One or more team member user IDs are invalid.' });
      }
    }

    // 2. Use a transaction to do all actions at once
    const result = await prisma.$transaction(async (tx) => {
      // Action A: Create the new prototype
      const newPrototype = await tx.prototype.create({
        data: {
          title,
          description,
          imageUrl,
          liveUrl,
          author: { connect: { id: authorId } },
          proposal: { connect: { id: proposalId } },
        },
      });

      // Action B: Create team member associations
      if (team.length > 0) {
        const teamMemberData = team.map(userId => ({
          prototypeId: newPrototype.id,
          userId: typeof userId === 'string' && userId.startsWith('user-') 
            ? parseInt(userId.replace('user-', '')) 
            : parseInt(userId),
        }));

        await tx.prototypeTeamMember.createMany({
          data: teamMemberData,
        });
      }

      // Action C: Increment the counter on the parent Idea
      await tx.idea.update({
        where: { id: ideaId },
        data: {
          totalPrototypes: {
            increment: 1,
          },
        },
      });

      await tx.user.update({
      where: { id: authorId },
      data: {
        stars: { increment: 2 }, // You can change the number of stars awarded here
      },
      });

      // Fetch the complete prototype with team details for response
      const completePrototype = await tx.prototype.findUnique({
        where: { id: newPrototype.id },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          team: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                },
              },
            },
          },
          proposal: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      return completePrototype;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to create prototype:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Proposal not found.' });
    }
    res.status(500).json({ error: 'An error occurred while creating the prototype.' });
  }
});

// Get all prototypes for that particular idea id
router.get('/:id/prototypes', async (req, res) => {
  const ideaId = parseInt(req.params.id);

  try {
    const prototypesForIdea = await prisma.prototype.findMany({
      where: {
        proposal: {
          subIdea: {
            ideaId: ideaId,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        team: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
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
