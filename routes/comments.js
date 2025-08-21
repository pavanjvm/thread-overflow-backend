import express from 'express';
import prisma from '../prisma/client.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authMiddleware);



router.post('/:subIdeaId', async (req, res) => {
  const subIdeaId = parseInt(req.params.subIdeaId);
  console.log(subIdeaId);
  const { content, parentCommentId } = req.body;
  console.log(content);
  const authorId = req.user.userId;

  // Validate input
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content is required.neega' });
  }

  try {
    // Verify subidea exists
    const subIdea = await prisma.subIdea.findUnique({
      where: { id: subIdeaId }
    });

    if (!subIdea) {
      return res.status(404).json({ error: 'SubIdea not found.' });
    }

    // If replying to a comment, verify parent exists and belongs to same subidea
    if (parentCommentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parseInt(parentCommentId) }
      });

      if (!parentComment || parentComment.subIdeaId !== subIdeaId) {
        return res.status(400).json({ error: 'Parent comment not found or belongs to different subidea.' });
      }
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        authorId,
        subIdeaId,
        parentCommentId: parentCommentId ? parseInt(parentCommentId) : null
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      comment
    });
  } catch (error) {
    console.error('Failed to create comment:', error);
    res.status(500).json({ error: 'An error occurred while creating the comment.' });
  }
});

// GET - Get all comments for a subidea
router.get('/:subIdeaId', async (req, res) => {
  const subIdeaId = parseInt(req.params.subIdeaId);

  try {
    // Verify subidea exists
    const subIdea = await prisma.subIdea.findUnique({
      where: { id: subIdeaId }
    });

    if (!subIdea) {
      return res.status(404).json({ error: 'SubIdea not found.' });
    }

    // Get total comment count (including replies)
    const totalComments = await prisma.comment.count({
      where: {
        subIdeaId: subIdeaId
      }
    });

    // Get top-level comments with their nested replies
    const comments = await prisma.comment.findMany({
      where: {
        subIdeaId: subIdeaId,
        parentCommentId: null // Only top-level comments
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true
                  }
                }
              },
              orderBy: {
                createdAt: 'asc'
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc' // Newest comments first
      }
    });

    res.status(200).json({
      success: true,
      comments,
      totalComments
    });
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    res.status(500).json({ error: 'An error occurred while fetching comments.' });
  }
});


router.post('/:prototypeId/prototype', async (req, res) => {
  const prototypeId = parseInt(req.params.prototypeId);
  const { content, parentCommentId } = req.body;
  const authorId = req.user.userId;

  // Validate input
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content is required.' });
  }

  try {
    // Verify prototype exists
    const prototype = await prisma.prototype.findUnique({
      where: { id: prototypeId }
    });

    if (!prototype) {
      return res.status(404).json({ error: 'Prototype not found.' });
    }

    // If replying to a comment, verify parent exists and belongs to same prototype
    if (parentCommentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parseInt(parentCommentId) }
      });

      if (!parentComment || parentComment.prototypeId !== prototypeId) {
        return res.status(400).json({ error: 'Parent comment not found or belongs to different prototype.' });
      }
    }

    // Create the comment
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        authorId,
        prototypeId,
        parentCommentId: parentCommentId ? parseInt(parentCommentId) : null
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      comment
    });
  } catch (error) {
    console.error('Failed to create prototype comment:', error);
    res.status(500).json({ error: 'An error occurred while creating the comment.' });
  }
});

// GET - Get all comments for a prototype
router.get('/:prototypeId/prototype', async (req, res) => {
  const prototypeId = parseInt(req.params.prototypeId);

  try {
    // Verify prototype exists
    const prototype = await prisma.prototype.findUnique({
      where: { id: prototypeId }
    });

    if (!prototype) {
      return res.status(404).json({ error: 'Prototype not found.' });
    }

    // Get total comment count (including replies)
    const totalComments = await prisma.comment.count({
      where: {
        prototypeId: prototypeId
      }
    });

    // Get top-level comments with their nested replies
    const comments = await prisma.comment.findMany({
      where: {
        prototypeId: prototypeId,
        parentCommentId: null // Only top-level comments
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatarUrl: true
          }
        },
        replies: {
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatarUrl: true
              }
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true
                  }
                }
              },
              orderBy: {
                createdAt: 'asc'
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc' // Newest comments first
      }
    });

    res.status(200).json({
      success: true,
      comments,
      totalComments
    });
  } catch (error) {
    console.error('Failed to fetch prototype comments:', error);
    res.status(500).json({ error: 'An error occurred while fetching comments.' });
  }
});

export default router;