import express from 'express';
import prisma from '../prisma/client.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authMiddleware);
/**
 * CREATE AN IDEA OR SOLUTION REQUEST
 * POST /api/ideas
 */
router.post('/', async (req, res) => {
  const { title, description, type, potentialBenefits } = req.body;
  const authorId = req.user.userId;

  // Basic validations
  if (!title || !description || !type) {
    return res.status(400).json({ error: 'Title, description, and type are required.' });
  }

  if (type !== 'IDEATION' && type !== 'SOLUTION_REQUEST') {
    return res.status(400).json({ error: "Type must be either 'IDEATION' or 'SOLUTION_REQUEST'." });
  }

  // Validate that potentialBenefits is an array of strings (if provided)
  if (potentialBenefits && (!Array.isArray(potentialBenefits) || !potentialBenefits.every(b => typeof b === 'string'))) {
    return res.status(400).json({ error: 'potentialBenefits must be an array of strings.' });
  }

  try {
    const newIdea = await prisma.idea.create({
      data: {
        title,
        description,
        type,
        potentialBenefits: potentialBenefits || [], // default to empty array if not provided
        authorId,
        status: 'OPEN',
      },
    });

    await prisma.user.update({
      where: { id: authorId },
      data: {
        stars: { increment: 2 }, // You can change the number of stars awarded here
      },
    });

    res.status(201).json({ message: 'Idea created', idea_details: newIdea });
  } catch (error) {
    console.error('Failed to create idea:', error);
    res.status(500).json({ error: 'An error occurred while creating the idea.' });
  }
});


const IdeaStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED'
};

//uses query parameter to get only the list of ideas that is opened or closed.
router.get('/', async (req, res) => {
  const { status } = req.query;
  const where = {};

  // If a valid status is provided (e.g., ?status=OPEN), add it to the filter
  const statusFilter = status?.toUpperCase() || 'OPEN';

  if (Object.values(IdeaStatus).includes(statusFilter)) {
    where.status = statusFilter;
  }

  try {
    const ideas = await prisma.idea.findMany({
      where: where,
      orderBy: {
        createdAt: 'desc',
      },
      // Select only the data needed for the UI
      select: {
        id: true,
        title: true,
        type: true,
        description: true,
        createdAt: true,
        author: {
          select: {
            name: true,
            avatarUrl: true,
          },
        },
        totalProposals: true,
        totalPrototypes: true,
      },
    });
    res.status(200).json(ideas);
  } catch (error) {
    console.error('Failed to fetch ideas:', error);
    res.status(500).json({ error: 'An error occurred while fetching ideas.' });
  }
});

// get single idea by idead id
router.get('/:id', async (req, res) => {
  const ideaId = parseInt(req.params.id);

  try {
    const idea = await prisma.idea.findUnique({
      where: {
        id: ideaId,
      },
      select: {
        title: true,
        description: true,
        potentialBenefits: true,
        status:true,
        createdAt: true,
        authorId: true,
        author: {
          select: {
            name: true,
            avatarUrl: true, // Added this line
          },
        },
      },
    });

    if (!idea) {
      return res.status(404).json({ error: 'Idea not found.' });
    }

    res.status(200).json(idea);
  } catch (error) {
    console.error(`Failed to fetch idea ${ideaId}:`, error);
    res.status(500).json({ error: 'An error occurred while fetching the idea.' });
  }
});

router.patch('/:id/close', async (req, res) => {
  const ideaId = parseInt(req.params.id);
  const userId = req.user.userId;

  if (isNaN(ideaId)) {
    return res.status(400).json({ error: 'Invalid idea ID.' });
  }

  try {
    // First check if the idea exists and if the user is the author
    const existingIdea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: { id: true, authorId: true, status: true }
    });

    if (!existingIdea) {
      return res.status(404).json({ error: 'Idea not found.' });
    }

    // Check if the user is the author of the idea (only author can close their idea)
    if (existingIdea.authorId !== userId) {
      return res.status(403).json({ error: 'You can only close your own ideas.' });
    }

    // Check if the idea is already closed
    if (existingIdea.status === 'CLOSED') {
      return res.status(400).json({ error: 'Idea is already closed.' });
    }

    // Update the idea status to CLOSED
    const updatedIdea = await prisma.idea.update({
      where: { id: ideaId },
      data: { status: 'CLOSED' },
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true
      }
    });

    res.status(200).json({ 
      message: 'Idea closed successfully', 
      idea: updatedIdea 
    });

  } catch (error) {
    console.error(`Failed to close idea ${ideaId}:`, error);
    res.status(500).json({ error: 'An error occurred while closing the idea.' });
  }
});

/**
 * DELETE AN IDEA
 * DELETE /api/ideas/:id
 */
router.delete('/:id', async (req, res) => {
  const ideaId = parseInt(req.params.id, 10);

  try {
    const existingIdea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: { id: true, authorId: true }
    });

    if (!existingIdea) {
      return res.status(404).json({ error: 'Idea not found' });
    }

    // Wrap everything in a transaction
    await prisma.$transaction(async (tx) => {
      // 1️⃣ Fetch all related entities with authors
      const subIdeas = await tx.subIdea.findMany({
        where: { ideaId },
        select: { authorId: true, id: true }
      });

      const proposals = await tx.proposal.findMany({
        where: { subIdea: { ideaId } },
        select: { authorId: true, id: true }
      });

      const prototypes = await tx.prototype.findMany({
        where: { proposal: { subIdea: { ideaId } } },
        select: { authorId: true }
      });

      // 2️⃣ Calculate stars to deduct
      const starsToDeduct = {};

      // Idea → +1 star originally
      starsToDeduct[existingIdea.authorId] =
        (starsToDeduct[existingIdea.authorId] || 0) + 1;

      // SubIdeas → +1 star each
      subIdeas.forEach(s => {
        starsToDeduct[s.authorId] = (starsToDeduct[s.authorId] || 0) + 1;
      });

      // Proposals → +2 stars each
      proposals.forEach(p => {
        starsToDeduct[p.authorId] = (starsToDeduct[p.authorId] || 0) + 2;
      });

      // Prototypes → +3 stars each
      prototypes.forEach(pr => {
        starsToDeduct[pr.authorId] = (starsToDeduct[pr.authorId] || 0) + 3;
      });

      // 3️⃣ Deduct stars from each user
      for (const [authorId, deduction] of Object.entries(starsToDeduct)) {
        await tx.user.update({
          where: { id: parseInt(authorId, 10) },
          data: { stars: { decrement: deduction } }
        });
      }

      // 4️⃣ Delete related votes
      await tx.vote.deleteMany({
        where: {
          OR: [
            { subIdea: { ideaId } },
            { proposal: { subIdea: { ideaId } } },
            { prototype: { proposal: { subIdea: { ideaId } } } }
          ]
        }
      });

      // 5️⃣ Delete related comments
      await tx.comment.deleteMany({
        where: {
          OR: [
            { subIdea: { ideaId } },
            { prototype: { proposal: { subIdea: { ideaId } } } }
          ]
        }
      });

      // 6️⃣ Delete prototype team members
      await tx.prototypeTeamMember.deleteMany({
        where: { prototype: { proposal: { subIdea: { ideaId } } } }
      });

      // 7️⃣ Delete prototypes
      await tx.prototype.deleteMany({
        where: { proposal: { subIdea: { ideaId } } }
      });

      // 8️⃣ Delete proposals
      await tx.proposal.deleteMany({
        where: { subIdea: { ideaId } }
      });

      // 9️⃣ Delete subIdeas
      await tx.subIdea.deleteMany({
        where: { ideaId }
      });

      // 🔟 Delete the idea itself
      await tx.idea.delete({
        where: { id: ideaId }
      });
    });

    res.json({ message: 'Idea and all related data deleted successfully with stars updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete idea' });
  }
});
export default router;