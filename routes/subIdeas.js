import express from 'express';
import subIdeaService from '../services/subIdeaService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validationMiddleware } from '../middleware/validationMiddleware.js';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/subideas
 * @desc Create a new sub-idea
 * @access Private
 */
router.post('/', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 sub-ideas per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { title, description, status, ideaId } = req.body;
      const authorId = req.user.userId;

      const result = await subIdeaService.createSubIdea(
        { title, description, status, ideaId },
        authorId
      );

      res.status(201).json({
        success: true,
        message: 'Sub-idea created successfully',
        data: result
      });

    } catch (error) {
      console.error('Create sub-idea route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || 
          error.message.includes('required') || 
          error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('already have') || 
                 error.message.includes('Cannot create')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while creating the sub-idea',
        data: null
      });
    }
  }
);

/**
 * @route GET /api/subideas
 * @desc Get sub-ideas with filtering and pagination
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const {
      ideaId,
      authorId,
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'asc'
    } = req.query;

    const result = await subIdeaService.getSubIdeas({
      ideaId,
      authorId,
      status,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50), // Max 50 items per page
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Sub-ideas fetched successfully',
      data: result.subIdeas,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get sub-ideas route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching sub-ideas',
      data: null
    });
  }
});

/**
 * @route GET /api/subideas/open
 * @desc Get open sub-ideas for prototyping (dropdown)
 * @access Public
 */
router.get('/open', async (req, res) => {
  try {
    const { search, limit = 100 } = req.query;

    const result = await subIdeaService.getOpenSubIdeas({
      search,
      limit: Math.min(parseInt(limit), 200) // Max 200 items for dropdown
    });

    res.status(200).json({
      success: true,
      message: 'Open sub-ideas fetched successfully',
      data: result
    });

  } catch (error) {
    console.error('Get open sub-ideas route error:', error.message);

    res.status(500).json({
      success: false,
      message: error.message || 'An error occurred while fetching open sub-ideas',
      data: null
    });
  }
});

/**
 * @route GET /api/subideas/stats
 * @desc Get sub-idea statistics
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    const { authorId, ideaId } = req.query;
    
    const stats = await subIdeaService.getSubIdeaStats(authorId, ideaId);

    res.status(200).json({
      success: true,
      message: 'Sub-idea statistics fetched successfully',
      data: stats
    });

  } catch (error) {
    console.error('Get sub-idea stats route error:', error.message);

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
 * @route GET /api/subideas/my-subideas
 * @desc Get current user's sub-ideas
 * @access Private
 */
router.get('/my-subideas', authMiddleware, async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await subIdeaService.getSubIdeasByAuthor(req.user.userId, {
      status,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Your sub-ideas fetched successfully',
      data: result.subIdeas,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get my sub-ideas route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching your sub-ideas',
      data: null
    });
  }
});

/**
 * @route GET /api/subideas/idea/:id
 * @desc Get sub-ideas for a specific idea
 * @access Public
 */
router.get('/idea/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'asc'
    } = req.query;

    const result = await subIdeaService.getSubIdeasForIdea(id, {
      status,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Sub-ideas for idea fetched successfully',
      data: result.subIdeas,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get sub-ideas for idea route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching sub-ideas',
      data: null
    });
  }
});

/**
 * @route GET /api/subideas/:id
 * @desc Get a single sub-idea by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const subIdea = await subIdeaService.getSubIdeaById(id);

    res.status(200).json({
      success: true,
      message: 'Sub-idea fetched successfully',
      data: subIdea
    });

  } catch (error) {
    console.error('Get sub-idea route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching the sub-idea',
      data: null
    });
  }
});

/**
 * @route PUT /api/subideas/:id
 * @desc Update a sub-idea
 * @access Private (Author, Idea Author, or Admin only)
 */
router.put('/:id', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 updates per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, status } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const result = await subIdeaService.updateSubIdea(
        id,
        { title, description, status },
        userId,
        userRole
      );

      res.status(200).json({
        success: true,
        message: 'Sub-idea updated successfully',
        data: result
      });

    } catch (error) {
      console.error('Update sub-idea route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('already exists')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while updating the sub-idea',
        data: null
      });
    }
  }
);

/**
 * @route PATCH /api/subideas/:id/status
 * @desc Change sub-idea status
 * @access Private (Author, Idea Author, or Admin only)
 */
router.patch('/:id/status', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 30 }), // 30 status changes per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required',
          data: null
        });
      }

      const result = await subIdeaService.changeSubIdeaStatus(id, status, userId, userRole);

      res.status(200).json({
        success: true,
        message: 'Sub-idea status updated successfully',
        data: result
      });

    } catch (error) {
      console.error('Change sub-idea status route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('Invalid') || error.message.includes('required')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while changing sub-idea status',
        data: null
      });
    }
  }
);

/**
 * @route DELETE /api/subideas/:id
 * @desc Delete a sub-idea
 * @access Private (Author, Idea Author, or Admin only)
 */
router.delete('/:id', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 5 }), // 5 deletes per 15 minutes
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const result = await subIdeaService.deleteSubIdea(id, userId, userRole);

      res.status(200).json({
        success: true,
        message: result.message,
        data: null
      });

    } catch (error) {
      console.error('Delete sub-idea route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('Cannot delete')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while deleting the sub-idea',
        data: null
      });
    }
  }
);

export default router;