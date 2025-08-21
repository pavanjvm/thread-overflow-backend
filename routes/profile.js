import express from 'express';
import prisma from '../prisma/client.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/me', async (req, res) => {
  try {
    // The user ID is added to `req.user` by the authMiddleware
    // NOTE: This assumes your JWT payload contains the user's ID, e.g., { id: 1, ... }
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        email: true, // You can include email for the user themselves
        avatarUrl: true,
        role: true,
      },
    });

    if (!user) {
      // This case is unlikely if the JWT is valid but good practice
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json(user);

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc', // or 'asc' based on preference
      },
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

router.get('/:userId/overview', async (req, res) => {
  const userId = parseInt(req.params.userId);

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    // Fetch user profile
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        // Optional custom fields
        bio: true,        // ← only if you added this to your schema
        stars: true       // ← only if this is in your schema
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch all user contributions
    const [ideas, proposals, prototypes] = await Promise.all([
      prisma.idea.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          status: true,
          potentialBenefits: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.proposal.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          presentationUrl: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.prototype.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          liveUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    res.json({
      user: {
        id: user.id.toString(), // as per your schema
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl ?? '',
        bio: user.bio ?? '',             // optional fallback
        stars: user.stars ?? 0,          // optional fallback
        totalIdeas: ideas.length,
        totalProposals: proposals.length,
        totalPrototypes: prototypes.length,
        joinedAt: user.createdAt.toISOString()
      },
      posts: [], // you can populate this later if needed
      ideas,
      proposals,
      prototypes
    });
  } catch (error) {
    console.error('Error fetching user overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;