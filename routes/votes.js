import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
const prisma = new PrismaClient();
router.use(authMiddleware);

// SubIdea voting route
router.post('/subideas/:subIdeaId', async (req, res) => {
  try {
    const { value } = req.body;
    const subIdeaId = parseInt(req.params.subIdeaId);
    const userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated uhh' });
    }

    if (!value || (value !== 1 && value !== -1)) {
      return res.status(400).json({ error: 'Vote value must be 1 (upvote) or -1 (downvote)' });
    }

    if (!subIdeaId) {
      return res.status(400).json({ error: 'subIdeaId is required' });
    }

    const subIdea = await prisma.subIdea.findUnique({
      where: { id: parseInt(subIdeaId) }
    });

    if (!subIdea) {
      return res.status(404).json({ error: 'SubIdea not found' });
    }

    const existingVote = await prisma.vote.findUnique({
      where: {
        userId_subIdeaId: {
          userId,
          subIdeaId: parseInt(subIdeaId)
        }
      }
    });

    let vote;
    let action;

    if (existingVote && existingVote.value === value) {
      await prisma.vote.delete({
        where: {
          userId_subIdeaId: {
            userId,
            subIdeaId: parseInt(subIdeaId)
          }
        }
      });
      vote = null;
      action = 'removed';
    } else {
      vote = await prisma.vote.upsert({
        where: {
          userId_subIdeaId: {
            userId,
            subIdeaId: parseInt(subIdeaId)
          }
        },
        update: { value },
        create: {
          userId,
          subIdeaId: parseInt(subIdeaId),
          value
        }
      });
      action = existingVote ? 'updated' : 'created';
    }

    const voteCounts = await prisma.vote.groupBy({
      by: ['value'],
      where: { subIdeaId: parseInt(subIdeaId) },
      _count: { value: true }
    });

    const upvotes = voteCounts.find(v => v.value === 1)?._count?.value || 0;
    const downvotes = voteCounts.find(v => v.value === -1)?._count?.value || 0;

    res.status(200).json({
      success: true,
      vote,
      action,
      voteCounts: {
        upvotes,
        downvotes,
        total: upvotes - downvotes
      }
    });

  } catch (error) {
    console.error('Error voting on SubIdea:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Prototype voting route
router.post('/prototypes/:prototypeId', async (req, res) => {
  try {
    const { value } = req.body;
    const prototypeId =  parseInt(req.params.prototypeId);
    const userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!value || (value !== 1 && value !== -1)) {
      return res.status(400).json({ error: 'Vote value must be 1 (upvote) or -1 (downvote)' });
    }

    if (!prototypeId) {
      return res.status(400).json({ error: 'prototypeId is required' });
    }

    const prototype = await prisma.prototype.findUnique({
      where: { id: parseInt(prototypeId) }
    });

    if (!prototype) {
      return res.status(404).json({ error: 'Prototype not found' });
    }

    const existingVote = await prisma.vote.findUnique({
      where: {
        userId_prototypeId: {
          userId,
          prototypeId: parseInt(prototypeId)
        }
      }
    });

    let vote;
    let action;

    if (existingVote && existingVote.value === value) {
      await prisma.vote.delete({
        where: {
          userId_prototypeId: {
            userId,
            prototypeId: parseInt(prototypeId)
          }
        }
      });
      vote = null;
      action = 'removed';
    } else {
      vote = await prisma.vote.upsert({
        where: {
          userId_prototypeId: {
            userId,
            prototypeId: parseInt(prototypeId)
          }
        },
        update: { value },
        create: {
          userId,
          prototypeId: parseInt(prototypeId),
          value
        }
      });
      action = existingVote ? 'updated' : 'created';
    }

    const voteCounts = await prisma.vote.groupBy({
      by: ['value'],
      where: { prototypeId: parseInt(prototypeId) },
      _count: { value: true }
    });

    const upvotes = voteCounts.find(v => v.value === 1)?._count?.value || 0;
    const downvotes = voteCounts.find(v => v.value === -1)?._count?.value || 0;

    res.status(200).json({
      success: true,
      vote,
      action,
      voteCounts: {
        upvotes,
        downvotes,
        total: upvotes - downvotes
      }
    });

  } catch (error) {
    console.error('Error voting on Prototype:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get SubIdea vote counts
router.get('/subideas', async (req, res) => {
  try {
    const subIdeaId = req.query.subIdeaId;
    const userId = req.user.userId;

    if (!subIdeaId) {
      return res.status(400).json({ error: 'subIdeaId is required as query parameter' });
    }

    const voteCounts = await prisma.vote.groupBy({
      by: ['value'],
      where: { subIdeaId: parseInt(subIdeaId) },
      _count: { value: true }
    });

    const upvotes = voteCounts.find(v => v.value === 1)?._count?.value || 0;
    const downvotes = voteCounts.find(v => v.value === -1)?._count?.value || 0;

    let userVote = null;
    if (userId) {
      const vote = await prisma.vote.findUnique({
        where: {
          userId_subIdeaId: {
            userId,
            subIdeaId: parseInt(subIdeaId)
          }
        }
      });
      userVote = vote?.value || null;
    }

    res.status(200).json({
      voteCounts: {
        upvotes,
        downvotes,
        total: upvotes - downvotes
      },
      userVote
    });

  } catch (error) {
    console.error('Error getting SubIdea votes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Prototype vote counts
router.get('/prototypes', async (req, res) => {
  try {
    const prototypeId = req.query.prototypeId;
    const userId = req.user?.id;

    if (!prototypeId) {
      return res.status(400).json({ error: 'prototypeId is required as query parameter' });
    }

    const voteCounts = await prisma.vote.groupBy({
      by: ['value'],
      where: { prototypeId: parseInt(prototypeId) },
      _count: { value: true }
    });

    const upvotes = voteCounts.find(v => v.value === 1)?._count?.value || 0;
    const downvotes = voteCounts.find(v => v.value === -1)?._count?.value || 0;

    let userVote = null;
    if (userId) {
      const vote = await prisma.vote.findUnique({
        where: {
          userId_prototypeId: {
            userId,
            prototypeId: parseInt(prototypeId)
          }
        }
      });
      userVote = vote?.value || null;
    }

    res.status(200).json({
      voteCounts: {
        upvotes,
        downvotes,
        total: upvotes - downvotes
      },
      userVote
    });

  } catch (error) {
    console.error('Error getting Prototype votes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
