import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();
router.use(authMiddleware);
/**
 * CREATE AN IDEA OR SOLUTION REQUEST
 * POST /api/ideas
 */
router.post('/',  async (req, res) => {
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
        status: 'OPEN' 
      },
    });
    res.status(201).json({ message: "idea created", idea_details: newIdea });
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
        potentialDollarValue: true,
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
export default router;