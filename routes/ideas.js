import express from 'express';
import ideaService from '../services/ideaService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validationMiddleware } from '../middleware/validationMiddleware.js';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/ideas
 * @desc Create a new idea or solution request
 * @access Private
 */
router.post('/', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 ideas per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { title, description, type, potentialDollarValue } = req.body;
      const authorId = req.user.userId;

      const result = await ideaService.createIdea(
        { title, description, type, potentialDollarValue },
        authorId
      );

      res.status(201).json({
        success: true,
        message: 'Idea created successfully',
        data: result
      });

    } catch (error) {
      console.error('Create idea route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || error.message.includes('required') || error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while creating the idea',
        data: null
      });
    }
  }
);

/**
 * @route GET /api/ideas
 * @desc Get ideas with filtering, pagination, and search
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      type,
      authorId,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await ideaService.getIdeas({
      status,
      type,
      authorId,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50), // Max 50 items per page
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Ideas fetched successfully',
      data: result.ideas,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get ideas route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching ideas',
      data: null
    });
  }
});

/**
 * @route GET /api/ideas/stats
 * @desc Get idea statistics
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    const { authorId } = req.query;
    
    const stats = await ideaService.getIdeaStats(authorId);

    res.status(200).json({
      success: true,
      message: 'Statistics fetched successfully',
      data: stats
    });

  } catch (error) {
    console.error('Get idea stats route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching statistics',
      data: null
    });
  }
});

/**
 * @route GET /api/ideas/my-ideas
 * @desc Get current user's ideas
 * @access Private
 */
router.get('/my-ideas', authMiddleware, async (req, res) => {
  try {
    const {
      status,
      type,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await ideaService.getIdeasByAuthor(req.user.userId, {
      status,
      type,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Your ideas fetched successfully',
      data: result.ideas,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get my ideas route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching your ideas',
      data: null
    });
  }
});

/**
 * @route GET /api/ideas/:id
 * @desc Get a single idea by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const idea = await ideaService.getIdeaById(id);

    res.status(200).json({
      success: true,
      message: 'Idea fetched successfully',
      data: idea
    });

  } catch (error) {
    console.error('Get idea route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching the idea',
      data: null
    });
  }
});

/**
 * @route PUT /api/ideas/:id
 * @desc Update an idea
 * @access Private (Author or Admin only)
 */
router.put('/:id', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 updates per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, potentialDollarValue, status } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const result = await ideaService.updateIdea(
        id,
        { title, description, potentialDollarValue, status },
        userId,
        userRole
      );

      res.status(200).json({
        success: true,
        message: 'Idea updated successfully',
        data: result
      });

    } catch (error) {
      console.error('Update idea route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while updating the idea',
        data: null
      });
    }
  }
);

/**
 * @route DELETE /api/ideas/:id
 * @desc Delete an idea
 * @access Private (Author or Admin only)
 */
router.delete('/:id', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 5 }), // 5 deletes per 15 minutes
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const result = await ideaService.deleteIdea(id, userId, userRole);

      res.status(200).json({
        success: true,
        message: result.message,
        data: null
      });

    } catch (error) {
      console.error('Delete idea route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while deleting the idea',
        data: null
      });
    }
  }
);

export default router;