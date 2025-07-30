import mongoose from 'mongoose';
import { Proposal, SubIdea, Idea, User } from '../models/index.js';
import { ProposalStatus } from '../models/enums.js';

class ProposalService {
  /**
   * Validates proposal creation input
   */
  validateProposalInput(title, description, presentationUrl) {
    const errors = [];

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      errors.push('Title must be at least 3 characters long');
    }

    if (title && title.trim().length > 200) {
      errors.push('Title cannot exceed 200 characters');
    }

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      errors.push('Description must be at least 10 characters long');
    }

    if (description && description.trim().length > 2000) {
      errors.push('Description cannot exceed 2000 characters');
    }

    if (presentationUrl && typeof presentationUrl === 'string') {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(presentationUrl)) {
        errors.push('Presentation URL must be a valid HTTP/HTTPS URL');
      }
    }

    return errors;
  }

  /**
   * Validates proposal status update input
   */
  validateStatusUpdateInput(status, rejectionReason) {
    const errors = [];

    if (!status || !Object.values(ProposalStatus).includes(status)) {
      errors.push('Status must be PENDING, ACCEPTED, or REJECTED');
    }

    if (status === ProposalStatus.REJECTED) {
      if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length < 3) {
        errors.push('Rejection reason is required and must be at least 3 characters long');
      }
      if (rejectionReason && rejectionReason.trim().length > 500) {
        errors.push('Rejection reason cannot exceed 500 characters');
      }
    }

    return errors;
  }

  /**
   * Validates ObjectId
   */
  validateObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
  }

  /**
   * Sanitizes input strings
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }

  /**
   * Creates a new proposal
   */
  async createProposal(proposalData, authorId) {
    const { title, description, presentationUrl, subIdeaId } = proposalData;

    // Validate input
    const validationErrors = this.validateProposalInput(title, description, presentationUrl);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate IDs
    if (!this.validateObjectId(authorId)) {
      throw new Error('Invalid author ID');
    }
    if (!this.validateObjectId(subIdeaId)) {
      throw new Error('Invalid sub-idea ID');
    }

    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        // 1. Verify author exists
        const author = await User.findById(authorId).session(session);
        if (!author) {
          throw new Error('Author not found');
        }

        // 2. Verify sub-idea exists and get parent idea
        const subIdea = await SubIdea.findById(subIdeaId)
          .populate('idea')
          .session(session);
        
        if (!subIdea) {
          throw new Error('Sub-idea not found');
        }

        // 3. Check if user already has a pending proposal for this sub-idea
        const existingProposal = await Proposal.findOne({
          authorId,
          subIdeaId,
          status: ProposalStatus.PENDING
        }).session(session);

        if (existingProposal) {
          throw new Error('You already have a pending proposal for this sub-idea');
        }

        // 4. Sanitize inputs
        const sanitizedTitle = this.sanitizeInput(title);
        const sanitizedDescription = this.sanitizeInput(description);
        const sanitizedPresentationUrl = presentationUrl ? this.sanitizeInput(presentationUrl) : null;

        // 5. Create proposal
        const newProposal = new Proposal({
          title: sanitizedTitle,
          description: sanitizedDescription,
          presentationUrl: sanitizedPresentationUrl,
          authorId,
          subIdeaId,
          status: ProposalStatus.PENDING
        });

        const savedProposal = await newProposal.save({ session });

        // 6. Increment totalProposals counter on parent idea
        await Idea.findByIdAndUpdate(
          subIdea.ideaId,
          { $inc: { totalProposals: 1 } },
          { session }
        );

        // 7. Populate author and subIdea info
        await savedProposal.populate([
          { path: 'author', select: 'name avatarUrl' },
          { path: 'subIdea', select: 'title' }
        ]);

        return savedProposal.toObject();
      });

      return result;
    } catch (error) {
      console.error('Database error in createProposal:', error);
      
      if (error.message.includes('not found') || error.message.includes('already have')) {
        throw error;
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to create proposal');
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets proposals with filtering and pagination
   */
  async getProposals(filters = {}) {
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
      } = filters;

      // Build query
      const query = {};

      // Filter by idea (get all proposals for sub-ideas under this idea)
      if (ideaId) {
        if (!this.validateObjectId(ideaId)) {
          throw new Error('Invalid idea ID');
        }
        
        const subIdeas = await SubIdea.find({ ideaId }).select('_id');
        const subIdeaIds = subIdeas.map(sub => sub._id);
        query.subIdeaId = { $in: subIdeaIds };
      }

      // Filter by specific sub-idea
      if (subIdeaId) {
        if (!this.validateObjectId(subIdeaId)) {
          throw new Error('Invalid sub-idea ID');
        }
        query.subIdeaId = subIdeaId;
      }

      // Filter by author
      if (authorId) {
        if (!this.validateObjectId(authorId)) {
          throw new Error('Invalid author ID');
        }
        query.authorId = authorId;
      }

      // Filter by status
      if (status && Object.values(ProposalStatus).includes(status.toUpperCase())) {
        query.status = status.toUpperCase();
      }

      // Search filter
      if (search) {
        const sanitizedSearch = this.sanitizeInput(search);
        query.$or = [
          { title: { $regex: sanitizedSearch, $options: 'i' } },
          { description: { $regex: sanitizedSearch, $options: 'i' } }
        ];
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const limitNum = parseInt(limit);

      // Sort
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [proposals, totalCount] = await Promise.all([
        Proposal.find(query)
          .populate('author', 'name avatarUrl')
          .populate('subIdea', 'title')
          .select('title description presentationUrl status rejectionReason createdAt updatedAt')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .exec(),
        Proposal.countDocuments(query)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limitNum);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        proposals: proposals.map(proposal => proposal.toObject()),
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: limitNum
        }
      };
    } catch (error) {
      console.error('Database error in getProposals:', error);
      throw new Error('Failed to fetch proposals');
    }
  }

  /**
   * Gets proposals for a specific idea
   */
  async getProposalsForIdea(ideaId, filters = {}) {
    return this.getProposals({ ...filters, ideaId });
  }

  /**
   * Gets a single proposal by ID
   */
  async getProposalById(proposalId) {
    if (!this.validateObjectId(proposalId)) {
      throw new Error('Invalid proposal ID');
    }

    try {
      const proposal = await Proposal.findById(proposalId)
        .populate('author', 'name avatarUrl')
        .populate({
          path: 'subIdea',
          select: 'title',
          populate: {
            path: 'idea',
            select: 'title authorId'
          }
        })
        .exec();

      if (!proposal) {
        throw new Error('Proposal not found');
      }

      return proposal.toObject();
    } catch (error) {
      console.error('Database error in getProposalById:', error);
      
      if (error.message === 'Proposal not found') {
        throw error;
      }
      
      throw new Error('Failed to fetch proposal');
    }
  }

  /**
   * Updates proposal status (accept/reject)
   */
  async updateProposalStatus(proposalId, statusData, userId) {
    const { status, rejectionReason } = statusData;

    // Validate input
    const validationErrors = this.validateStatusUpdateInput(status, rejectionReason);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate ID
    if (!this.validateObjectId(proposalId)) {
      throw new Error('Invalid proposal ID');
    }

    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        // 1. Get proposal with related data
        const proposal = await Proposal.findById(proposalId)
          .populate({
            path: 'subIdea',
            populate: {
              path: 'idea',
              select: 'authorId'
            }
          })
          .session(session);

        if (!proposal) {
          throw new Error('Proposal not found');
        }

        // 2. Check authorization - only idea author can update status
        const ideaAuthorId = proposal.subIdea.idea.authorId.toString();
        if (ideaAuthorId !== userId) {
          throw new Error('Unauthorized: Only the idea author can accept or reject proposals');
        }

        // 3. Check if proposal is still pending
        if (proposal.status !== ProposalStatus.PENDING) {
          throw new Error(`Cannot update proposal status. Current status: ${proposal.status}`);
        }

        // 4. Update proposal
        const updateData = {
          status,
          rejectionReason: status === ProposalStatus.REJECTED ? 
            this.sanitizeInput(rejectionReason) : null
        };

        const updatedProposal = await Proposal.findByIdAndUpdate(
          proposalId,
          updateData,
          { new: true, session, runValidators: true }
        )
          .populate('author', 'name avatarUrl')
          .populate('subIdea', 'title');

        return updatedProposal.toObject();
      });

      return result;
    } catch (error) {
      console.error('Database error in updateProposalStatus:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('Unauthorized') || 
          error.message.includes('Cannot update')) {
        throw error;
      }
      
      throw new Error('Failed to update proposal status');
    } finally {
      await session.endSession();
    }
  }

  /**
   * Updates a proposal (by author only)
   */
  async updateProposal(proposalId, updateData, userId) {
    const { title, description, presentationUrl } = updateData;

    // Validate input
    const validationErrors = this.validateProposalInput(title, description, presentationUrl);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate ID
    if (!this.validateObjectId(proposalId)) {
      throw new Error('Invalid proposal ID');
    }

    try {
      // 1. Get existing proposal
      const existingProposal = await Proposal.findById(proposalId);
      if (!existingProposal) {
        throw new Error('Proposal not found');
      }

      // 2. Check authorization - only author can update
      if (existingProposal.authorId.toString() !== userId) {
        throw new Error('Unauthorized: Only the proposal author can update this proposal');
      }

      // 3. Check if proposal is still pending
      if (existingProposal.status !== ProposalStatus.PENDING) {
        throw new Error(`Cannot update proposal. Current status: ${existingProposal.status}`);
      }

      // 4. Update proposal
      const updateFields = {
        title: this.sanitizeInput(title),
        description: this.sanitizeInput(description),
        presentationUrl: presentationUrl ? this.sanitizeInput(presentationUrl) : null
      };

      const updatedProposal = await Proposal.findByIdAndUpdate(
        proposalId,
        updateFields,
        { new: true, runValidators: true }
      )
        .populate('author', 'name avatarUrl')
        .populate('subIdea', 'title');

      return updatedProposal.toObject();
    } catch (error) {
      console.error('Database error in updateProposal:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('Unauthorized') || 
          error.message.includes('Cannot update')) {
        throw error;
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to update proposal');
    }
  }

  /**
   * Deletes a proposal
   */
  async deleteProposal(proposalId, userId, userRole) {
    // Validate ID
    if (!this.validateObjectId(proposalId)) {
      throw new Error('Invalid proposal ID');
    }

    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        // 1. Get existing proposal with sub-idea
        const existingProposal = await Proposal.findById(proposalId)
          .populate('subIdea')
          .session(session);
        
        if (!existingProposal) {
          throw new Error('Proposal not found');
        }

        // 2. Check authorization
        if (existingProposal.authorId.toString() !== userId && userRole !== 'ADMIN') {
          throw new Error('Unauthorized: Only the proposal author or admin can delete this proposal');
        }

        // 3. Delete proposal
        await Proposal.findByIdAndDelete(proposalId).session(session);

        // 4. Decrement totalProposals counter on parent idea
        await Idea.findByIdAndUpdate(
          existingProposal.subIdea.ideaId,
          { $inc: { totalProposals: -1 } },
          { session }
        );

        return { message: 'Proposal deleted successfully' };
      });

      return result;
    } catch (error) {
      console.error('Database error in deleteProposal:', error);
      
      if (error.message.includes('not found') || error.message.includes('Unauthorized')) {
        throw error;
      }
      
      throw new Error('Failed to delete proposal');
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets proposal statistics
   */
  async getProposalStats(authorId = null, ideaId = null) {
    try {
      const matchStage = {};
      
      if (authorId) {
        if (!this.validateObjectId(authorId)) {
          throw new Error('Invalid author ID');
        }
        matchStage.authorId = new mongoose.Types.ObjectId(authorId);
      }

      if (ideaId) {
        if (!this.validateObjectId(ideaId)) {
          throw new Error('Invalid idea ID');
        }
        
        const subIdeas = await SubIdea.find({ ideaId }).select('_id');
        const subIdeaIds = subIdeas.map(sub => sub._id);
        matchStage.subIdeaId = { $in: subIdeaIds };
      }

      const stats = await Proposal.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalProposals: { $sum: 1 },
            pendingProposals: {
              $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] }
            },
            acceptedProposals: {
              $sum: { $cond: [{ $eq: ['$status', 'ACCEPTED'] }, 1, 0] }
            },
            rejectedProposals: {
              $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] }
            },
            avgResponseTime: {
              $avg: {
                $cond: [
                  { $ne: ['$status', 'PENDING'] },
                  { $subtract: ['$updatedAt', '$createdAt'] },
                  null
                ]
              }
            }
          }
        }
      ]);

      return stats[0] || {
        totalProposals: 0,
        pendingProposals: 0,
        acceptedProposals: 0,
        rejectedProposals: 0,
        avgResponseTime: 0
      };
    } catch (error) {
      console.error('Database error in getProposalStats:', error);
      throw new Error('Failed to fetch proposal statistics');
    }
  }
}

export default new ProposalService();