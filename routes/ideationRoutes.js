import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/', authMiddleware, async (req, res) => {

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
      },
    });

    res.status(201).json(newIdea);
  } catch (error) {
    console.error('Failed to create idea:', error);
    res.status(500).json({ error: 'An error occurred while creating the idea.' });
  }
});

router.post('/:ideaId/subideas', authMiddleware, async (req, res) => {
 
  const { ideaId } = req.params;


  const { title, description, status } = req.body;


  const authorId = req.user.userId;

  // 4. Validate the input
  if (!title || !description || !status) {
    return res.status(400).json({ error: 'Title, description, and status are required.' });
  }

  // Ensure the 'status' is one of the allowed enum values
  if (!Object.values(SubIdeaStatus).includes(status)) {
    return res.status(400).json({
      error: `Status must be one of the following: ${Object.values(SubIdeaStatus).join(', ')}`,
    });
  }

  try {
    // 5. Create the new SubIdea in the database
    const newSubIdea = await prisma.subIdea.create({
      data: {
        title,
        description,
        status,
        author: { connect: { id: authorId } }, // Connect to the author (User)
        idea: { connect: { id: ideaId } },     // Connect to the parent (Idea)
      },
    });

    res.status(201).json(newSubIdea);
  } catch (error) {
    console.error('Failed to create sub-idea:', error);
    // This is a common error if the parent 'ideaId' does not exist
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Parent idea not found.' });
    }
    res.status(500).json({ error: 'An error occurred while creating the sub-idea.' });
  }
});



export default router;