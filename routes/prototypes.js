import express from 'express';
import prototypeService from '../services/prototypeService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validationMiddleware } from '../middleware/validationMiddleware.js';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/prototypes/submit/:proposalId
 * @desc Submit a new prototype for an accepted proposal
 * @access Private
 */
router.post('/submit/:proposalId', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 3 }), // 3 prototypes per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { proposalId } = req.params;
      const { title, description, imageUrl, liveUrl } = req.body;
      const authorId = req.user.userId;

      const result = await prototypeService.createPrototype(
        { title, description, imageUrl, liveUrl, proposalId },
        authorId
      );

      res.status(201).json({
        success: true,
        message: 'Prototype submitted successfully',
        data: result
      });

    } catch (error) {
      console.error('Submit prototype route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || 
          error.message.includes('required') || 
          error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('already have') || 
                 error.message.includes('can only be created')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while submitting the prototype',
        data: null
      });
    }
  }
);

/**
 * @route GET /api/prototypes
 * @desc Get prototypes with filtering and pagination
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const {
      ideaId,
      proposalId,
      authorId,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await prototypeService.getPrototypes({
      ideaId,
      proposalId,
      authorId,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50), // Max 50 items per page
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Prototypes fetched successfully',
      data: result.prototypes,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get prototypes route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching prototypes',
      data: null
    });
  }
});

/**
 * @route GET /api/prototypes/idea/:id
 * @desc Get all prototypes for a specific idea
 * @access Public
 */
router.get('/idea/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await prototypeService.getPrototypesForIdea(id, {
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Prototypes for idea fetched successfully',
      data: result.prototypes,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get prototypes for idea route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching prototypes',
      data: null
    });
  }
});

/**
 * @route GET /api/prototypes/stats
 * @desc Get prototype statistics
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    const { authorId, ideaId } = req.query;
    
    const stats = await prototypeService.getPrototypeStats(authorId, ideaId);

    res.status(200).json({
      success: true,
      message: 'Prototype statistics fetched successfully',
      data: stats
    });

  } catch (error) {
    console.error('Get prototype stats route error:', error.message);

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
 * @route GET /api/prototypes/my-prototypes
 * @desc Get current user's prototypes
 * @access Private
 */
router.get('/my-prototypes', authMiddleware, async (req, res) => {
  try {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await prototypeService.getPrototypes({
      authorId: req.user.userId,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Your prototypes fetched successfully',
      data: result.prototypes,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get my prototypes route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching your prototypes',
      data: null
    });
  }
});

/**
 * @route GET /api/prototypes/:id
 * @desc Get a single prototype by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const prototype = await prototypeService.getPrototypeById(id);

    res.status(200).json({
      success: true,
      message: 'Prototype fetched successfully',
      data: prototype
    });

  } catch (error) {
    console.error('Get prototype route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching the prototype',
      data: null
    });
  }
});

/**
 * @route PUT /api/prototypes/:id
 * @desc Update a prototype (author or team members only)
 * @access Private
 */
router.put('/:id', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 updates per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, imageUrl, liveUrl } = req.body;
      const userId = req.user.userId;

      const result = await prototypeService.updatePrototype(
        id,
        { title, description, imageUrl, liveUrl },
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Prototype updated successfully',
        data: result
      });

    } catch (error) {
      console.error('Update prototype route error:', error.message);

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
        message: error.message || 'An error occurred while updating the prototype',
        data: null
      });
    }
  }
);

/**
 * @route DELETE /api/prototypes/:id
 * @desc Delete a prototype
 * @access Private (Author or Admin only)
 */
router.delete('/:id', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 3 }), // 3 deletes per 15 minutes
  async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const result = await prototypeService.deletePrototype(id, userId, userRole);

      res.status(200).json({
        success: true,
        message: result.message,
        data: null
      });

    } catch (error) {
      console.error('Delete prototype route error:', error.message);

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
        message: error.message || 'An error occurred while deleting the prototype',
        data: null
      });
    }
  }
);

/**
 * @route POST /api/prototypes/:id/team
 * @desc Add team member to prototype
 * @access Private (Author only)
 */
router.post('/:id/team', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 team operations per 15 minutes
  async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      const requesterId = req.user.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required',
          data: null
        });
      }

      const result = await prototypeService.addTeamMember(id, userId, requesterId);

      res.status(200).json({
        success: true,
        message: 'Team member added successfully',
        data: result
      });

    } catch (error) {
      console.error('Add team member route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('Invalid') || error.message.includes('required')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('already a team member')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while adding team member',
        data: null
      });
    }
  }
);

/**
 * @route DELETE /api/prototypes/:id/team/:userId
 * @desc Remove team member from prototype
 * @access Private (Author or the user themselves)
 */
router.delete('/:id/team/:userId', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 team operations per 15 minutes
  async (req, res) => {
    try {
      const { id, userId } = req.params;
      const requesterId = req.user.userId;

      const result = await prototypeService.removeTeamMember(id, userId, requesterId);

      res.status(200).json({
        success: true,
        message: 'Team member removed successfully',
        data: result
      });

    } catch (error) {
      console.error('Remove team member route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized') || error.message.includes('Cannot remove')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while removing team member',
        data: null
      });
    }
  }
);

export default router;