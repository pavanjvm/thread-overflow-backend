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
  const ideaId = parseInt(req.params.id);
  const userId = req.user.userId;
  const userRole = req.user.role; // Assuming role is available in req.user

  if (isNaN(ideaId)) {
    return res.status(400).json({ error: 'Invalid idea ID.' });
  }

  try {
    // First check if the idea exists and get author info
    const existingIdea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: { 
        id: true, 
        authorId: true, 
        title: true,
        _count: {
          subIdeas: true
        }
      }
    });

    if (!existingIdea) {
      return res.status(404).json({ error: 'Idea not found.' });
    }

    // Check permissions: only the author or admin can delete
    if (existingIdea.authorId !== userId && userRole !== 'ADMIN') {
      return res.status(403).json({ 
        error: 'You can only delete your own ideas or you must be an admin.' 
      });
    }

    // Check if there are related sub-ideas (optional business logic)
    if (existingIdea._count.subIdeas > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete idea with existing sub-ideas. Please delete all sub-ideas first.' 
      });
    }

    // Delete the idea (this will cascade delete related records based on your schema)
    await prisma.idea.delete({
      where: { id: ideaId }
    });

    res.status(200).json({ 
      message: 'Idea deleted successfully',
      deletedIdeaId: ideaId,
      title: existingIdea.title
    });

  } catch (error) {
    console.error(`Failed to delete idea ${ideaId}:`, error);
    
    // Handle foreign key constraint errors
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Cannot delete idea due to related records. Please delete all related sub-ideas, proposals, and prototypes first.' 
      });
    }
    
    res.status(500).json({ error: 'An error occurred while deleting the idea.' });
  }
});
export default router;