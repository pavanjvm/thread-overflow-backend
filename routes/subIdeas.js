import express from 'express';
import { PrismaClient, SubIdeaStatus } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();


router.post('/', authMiddleware, async (req, res) => {
  // Get parent ideaId from the request BODY now
  const { title, description, status, ideaId } = req.body;
  const authorId = req.user.userId;

  // Validate input
  if (!title || !description || !status || !ideaId) {
    return res.status(400).json({ error: 'Title, description, status, and ideaId are required.' });
  }
  if (!Object.values(SubIdeaStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }

  try {
    const newSubIdea = await prisma.subIdea.create({
      data: {
        title,
        description,
        status,
        author: { connect: { id: authorId } },
        idea: { connect: { id: parseInt(ideaId) } }, // Connect using ideaId from body
      },
    });
    res.status(201).json(newSubIdea);
  } catch (error) {
    console.error('Failed to create sub-idea:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Parent idea not found.' });
    }
    res.status(500).json({ error: 'An error occurred.' });
  }
});



router.get('/open', async (req, res) => {
  try {
    const openSubIdeas = await prisma.subIdea.findMany({
      where: { status: 'OPEN_FOR_PROTOTYPING' },
      select: { id: true, title: true },
    });
    res.status(200).json(openSubIdeas);
  } catch (error) {
    console.error('Failed to fetch open sub-ideas:', error);
    res.status(500).json({ error: 'An error occurred.' });
  }
});


export default router;