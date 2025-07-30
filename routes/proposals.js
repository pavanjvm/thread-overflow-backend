import express from 'express';
import proposalService from '../services/proposalService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validationMiddleware } from '../middleware/validationMiddleware.js';
import { rateLimitMiddleware } from '../middleware/rateLimitMiddleware.js';

const router = express.Router();

/**
 * @route POST /api/proposals/submit/:subIdeaId
 * @desc Submit a new proposal for a sub-idea
 * @access Private
 */
router.post('/submit/:subIdeaId', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 5 }), // 5 proposals per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { subIdeaId } = req.params;
      const { title, description, presentationUrl } = req.body;
      const authorId = req.user.userId;

      const result = await proposalService.createProposal(
        { title, description, presentationUrl, subIdeaId },
        authorId
      );

      res.status(201).json({
        success: true,
        message: 'Proposal submitted successfully',
        data: result
      });

    } catch (error) {
      console.error('Submit proposal route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || 
          error.message.includes('required') || 
          error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('already have')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while submitting the proposal',
        data: null
      });
    }
  }
);

/**
 * @route GET /api/proposals
 * @desc Get proposals with filtering and pagination
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const {
      ideaId,
      subIdeaId,
      authorId,
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await proposalService.getProposals({
      ideaId,
      subIdeaId,
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
      message: 'Proposals fetched successfully',
      data: result.proposals,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get proposals route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching proposals',
      data: null
    });
  }
});

/**
 * @route GET /api/proposals/idea/:id
 * @desc Get all proposals for a specific idea
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
      sortOrder = 'desc'
    } = req.query;

    const result = await proposalService.getProposalsForIdea(id, {
      status,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Proposals for idea fetched successfully',
      data: result.proposals,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get proposals for idea route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching proposals',
      data: null
    });
  }
});

/**
 * @route GET /api/proposals/stats
 * @desc Get proposal statistics
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    const { authorId, ideaId } = req.query;
    
    const stats = await proposalService.getProposalStats(authorId, ideaId);

    res.status(200).json({
      success: true,
      message: 'Proposal statistics fetched successfully',
      data: stats
    });

  } catch (error) {
    console.error('Get proposal stats route error:', error.message);

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
 * @route GET /api/proposals/my-proposals
 * @desc Get current user's proposals
 * @access Private
 */
router.get('/my-proposals', authMiddleware, async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = await proposalService.getProposals({
      authorId: req.user.userId,
      status,
      search,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
      sortBy,
      sortOrder
    });

    res.status(200).json({
      success: true,
      message: 'Your proposals fetched successfully',
      data: result.proposals,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Get my proposals route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching your proposals',
      data: null
    });
  }
});

/**
 * @route GET /api/proposals/:id
 * @desc Get a single proposal by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const proposal = await proposalService.getProposalById(id);

    res.status(200).json({
      success: true,
      message: 'Proposal fetched successfully',
      data: proposal
    });

  } catch (error) {
    console.error('Get proposal route error:', error.message);

    let statusCode = 500;
    if (error.message.includes('Invalid')) {
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while fetching the proposal',
      data: null
    });
  }
});

/**
 * @route PUT /api/proposals/:id
 * @desc Update a proposal (author only)
 * @access Private
 */
router.put('/:id', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 10 }), // 10 updates per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, description, presentationUrl } = req.body;
      const userId = req.user.userId;

      const result = await proposalService.updateProposal(
        id,
        { title, description, presentationUrl },
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Proposal updated successfully',
        data: result
      });

    } catch (error) {
      console.error('Update proposal route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('Cannot update')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while updating the proposal',
        data: null
      });
    }
  }
);

/**
 * @route PATCH /api/proposals/:id/status
 * @desc Update proposal status (accept/reject) - idea author only
 * @access Private
 */
router.patch('/:id/status', 
  authMiddleware,
  rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 20 }), // 20 status updates per 15 minutes
  validationMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, rejectionReason } = req.body;
      const userId = req.user.userId;

      const result = await proposalService.updateProposalStatus(
        id,
        { status, rejectionReason },
        userId
      );

      res.status(200).json({
        success: true,
        message: 'Proposal status updated successfully',
        data: result
      });

    } catch (error) {
      console.error('Update proposal status route error:', error.message);

      let statusCode = 500;
      if (error.message.includes('must be') || error.message.includes('Invalid')) {
        statusCode = 400;
      } else if (error.message.includes('Unauthorized')) {
        statusCode = 403;
      } else if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('Cannot update')) {
        statusCode = 409;
      }

      res.status(statusCode).json({
        success: false,
        message: error.message || 'An error occurred while updating the proposal status',
        data: null
      });
    }
  }
);

/**
 * @route DELETE /api/proposals/:id
 * @desc Delete a proposal
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

      const result = await proposalService.deleteProposal(id, userId, userRole);

      res.status(200).json({
        success: true,
        message: result.message,
        data: null
      });

    } catch (error) {
      console.error('Delete proposal route error:', error.message);

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
        message: error.message || 'An error occurred while deleting the proposal',
        data: null
      });
    }
  }
);

export default router;