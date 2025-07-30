import mongoose from 'mongoose';
import { SubIdea, Idea, User } from '../models/index.js';
import { SubIdeaStatus } from '../models/enums.js';

class SubIdeaService {
  /**
   * Validates sub-idea creation input
   */
  validateSubIdeaInput(title, description, status, ideaId) {
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

    if (!status || !Object.values(SubIdeaStatus).includes(status)) {
      errors.push('Status must be either OPEN_FOR_PROTOTYPING or SELF_PROTOTYPING');
    }

    if (!ideaId) {
      errors.push('Parent idea ID is required');
    }

    return errors;
  }

  /**
   * Validates sub-idea update input
   */
  validateSubIdeaUpdateInput(title, description, status) {
    const errors = [];

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || title.trim().length < 3) {
        errors.push('Title must be at least 3 characters long');
      }
      if (title.trim().length > 200) {
        errors.push('Title cannot exceed 200 characters');
      }
    }

    if (description !== undefined) {
      if (!description || typeof description !== 'string' || description.trim().length < 10) {
        errors.push('Description must be at least 10 characters long');
      }
      if (description.trim().length > 2000) {
        errors.push('Description cannot exceed 2000 characters');
      }
    }

    if (status !== undefined && !Object.values(SubIdeaStatus).includes(status)) {
      errors.push('Status must be either OPEN_FOR_PROTOTYPING or SELF_PROTOTYPING');
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
   * Creates a new sub-idea
   */
  async createSubIdea(subIdeaData, authorId) {
    const { title, description, status, ideaId } = subIdeaData;

    // Validate input
    const validationErrors = this.validateSubIdeaInput(title, description, status, ideaId);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate IDs
    if (!this.validateObjectId(authorId)) {
      throw new Error('Invalid author ID');
    }
    if (!this.validateObjectId(ideaId)) {
      throw new Error('Invalid idea ID');
    }

    try {
      // 1. Verify author exists
      const author = await User.findById(authorId);
      if (!author) {
        throw new Error('Author not found');
      }

      // 2. Verify parent idea exists and is open
      const parentIdea = await Idea.findById(ideaId);
      if (!parentIdea) {
        throw new Error('Parent idea not found');
      }

      if (parentIdea.status === 'CLOSED') {
        throw new Error('Cannot create sub-ideas for closed ideas');
      }

      // 3. Check if user already has a sub-idea with the same title for this idea
      const existingSubIdea = await SubIdea.findOne({
        authorId,
        ideaId,
        title: { $regex: new RegExp(`^${title.trim()}$`, 'i') }
      });

      if (existingSubIdea) {
        throw new Error('You already have a sub-idea with this title for this idea');
      }

      // 4. Sanitize inputs
      const sanitizedTitle = this.sanitizeInput(title);
      const sanitizedDescription = this.sanitizeInput(description);

      // 5. Create sub-idea
      const newSubIdea = new SubIdea({
        title: sanitizedTitle,
        description: sanitizedDescription,
        status,
        authorId,
        ideaId
      });

      const savedSubIdea = await newSubIdea.save();

      // 6. Populate author information
      await savedSubIdea.populate('author', 'name avatarUrl');

      return savedSubIdea.toObject();
    } catch (error) {
      console.error('Database error in createSubIdea:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('already have') ||
          error.message.includes('Cannot create')) {
        throw error;
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to create sub-idea');
    }
  }

  /**
   * Gets sub-ideas with filtering and pagination
   */
  async getSubIdeas(filters = {}) {
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
      } = filters;

      // Build query
      const query = {};

      // Filter by idea
      if (ideaId) {
        if (!this.validateObjectId(ideaId)) {
          throw new Error('Invalid idea ID');
        }
        query.ideaId = ideaId;
      }

      // Filter by author
      if (authorId) {
        if (!this.validateObjectId(authorId)) {
          throw new Error('Invalid author ID');
        }
        query.authorId = authorId;
      }

      // Filter by status
      if (status && Object.values(SubIdeaStatus).includes(status.toUpperCase())) {
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
      const [subIdeas, totalCount] = await Promise.all([
        SubIdea.find(query)
          .populate('author', 'name avatarUrl')
          .populate('idea', 'title status')
          .select('title description status createdAt updatedAt')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .exec(),
        SubIdea.countDocuments(query)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limitNum);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        subIdeas: subIdeas.map(subIdea => subIdea.toObject()),
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
      console.error('Database error in getSubIdeas:', error);
      throw new Error('Failed to fetch sub-ideas');
    }
  }

  /**
   * Gets sub-ideas for a specific idea
   */
  async getSubIdeasForIdea(ideaId, filters = {}) {
    return this.getSubIdeas({ ...filters, ideaId });
  }

  /**
   * Gets open sub-ideas for prototyping (dropdown)
   */
  async getOpenSubIdeas(filters = {}) {
    try {
      const {
        search,
        limit = 100
      } = filters;

      const query = { status: SubIdeaStatus.OPEN_FOR_PROTOTYPING };

      // Search filter
      if (search) {
        const sanitizedSearch = this.sanitizeInput(search);
        query.title = { $regex: sanitizedSearch, $options: 'i' };
      }

      const subIdeas = await SubIdea.find(query)
        .populate('idea', 'title')
        .select('title')
        .sort({ title: 1 })
        .limit(parseInt(limit))
        .exec();

      return subIdeas.map(subIdea => subIdea.toObject());
    } catch (error) {
      console.error('Database error in getOpenSubIdeas:', error);
      throw new Error('Failed to fetch open sub-ideas');
    }
  }

  /**
   * Gets a single sub-idea by ID
   */
  async getSubIdeaById(subIdeaId) {
    if (!this.validateObjectId(subIdeaId)) {
      throw new Error('Invalid sub-idea ID');
    }

    try {
      const subIdea = await SubIdea.findById(subIdeaId)
        .populate('author', 'name avatarUrl')
        .populate('idea', 'title status authorId')
        .exec();

      if (!subIdea) {
        throw new Error('Sub-idea not found');
      }

      return subIdea.toObject();
    } catch (error) {
      console.error('Database error in getSubIdeaById:', error);
      
      if (error.message === 'Sub-idea not found') {
        throw error;
      }
      
      throw new Error('Failed to fetch sub-idea');
    }
  }

  /**
   * Updates a sub-idea
   */
  async updateSubIdea(subIdeaId, updateData, userId, userRole) {
    const { title, description, status } = updateData;

    // Validate input
    const validationErrors = this.validateSubIdeaUpdateInput(title, description, status);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate ID
    if (!this.validateObjectId(subIdeaId)) {
      throw new Error('Invalid sub-idea ID');
    }

    try {
      // 1. Get existing sub-idea
      const existingSubIdea = await SubIdea.findById(subIdeaId).populate('idea');
      if (!existingSubIdea) {
        throw new Error('Sub-idea not found');
      }

      // 2. Check authorization (author, idea author, or admin can update)
      const isAuthor = existingSubIdea.authorId.toString() === userId;
      const isIdeaAuthor = existingSubIdea.idea.authorId.toString() === userId;
      const isAdmin = userRole === 'ADMIN';

      if (!isAuthor && !isIdeaAuthor && !isAdmin) {
        throw new Error('Unauthorized: Only the sub-idea author, idea author, or admin can update this sub-idea');
      }

      // 3. Check if title already exists for this idea (if title is being updated)
      if (title && title !== existingSubIdea.title) {
        const duplicateSubIdea = await SubIdea.findOne({
          ideaId: existingSubIdea.ideaId,
          title: { $regex: new RegExp(`^${title.trim()}$`, 'i') },
          _id: { $ne: subIdeaId }
        });

        if (duplicateSubIdea) {
          throw new Error('A sub-idea with this title already exists for this idea');
        }
      }

      // 4. Update sub-idea
      const updateFields = {};
      if (title !== undefined) updateFields.title = this.sanitizeInput(title);
      if (description !== undefined) updateFields.description = this.sanitizeInput(description);
      if (status !== undefined) updateFields.status = status;

      const updatedSubIdea = await SubIdea.findByIdAndUpdate(
        subIdeaId,
        updateFields,
        { new: true, runValidators: true }
      )
        .populate('author', 'name avatarUrl')
        .populate('idea', 'title status');

      return updatedSubIdea.toObject();
    } catch (error) {
      console.error('Database error in updateSubIdea:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('Unauthorized') ||
          error.message.includes('already exists')) {
        throw error;
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to update sub-idea');
    }
  }

  /**
   * Deletes a sub-idea
   */
  async deleteSubIdea(subIdeaId, userId, userRole) {
    // Validate ID
    if (!this.validateObjectId(subIdeaId)) {
      throw new Error('Invalid sub-idea ID');
    }

    try {
      // 1. Get existing sub-idea
      const existingSubIdea = await SubIdea.findById(subIdeaId).populate('idea');
      if (!existingSubIdea) {
        throw new Error('Sub-idea not found');
      }

      // 2. Check authorization (author, idea author, or admin can delete)
      const isAuthor = existingSubIdea.authorId.toString() === userId;
      const isIdeaAuthor = existingSubIdea.idea.authorId.toString() === userId;
      const isAdmin = userRole === 'ADMIN';

      if (!isAuthor && !isIdeaAuthor && !isAdmin) {
        throw new Error('Unauthorized: Only the sub-idea author, idea author, or admin can delete this sub-idea');
      }

      // 3. Check if sub-idea has proposals (prevent deletion if it has proposals)
      const { Proposal } = await import('../models/index.js');
      const proposalCount = await Proposal.countDocuments({ subIdeaId });
      
      if (proposalCount > 0) {
        throw new Error('Cannot delete sub-idea that has proposals. Please delete proposals first.');
      }

      // 4. Delete sub-idea
      await SubIdea.findByIdAndDelete(subIdeaId);

      return { message: 'Sub-idea deleted successfully' };
    } catch (error) {
      console.error('Database error in deleteSubIdea:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('Unauthorized') ||
          error.message.includes('Cannot delete')) {
        throw error;
      }
      
      throw new Error('Failed to delete sub-idea');
    }
  }

  /**
   * Gets sub-ideas by author
   */
  async getSubIdeasByAuthor(authorId, filters = {}) {
    if (!this.validateObjectId(authorId)) {
      throw new Error('Invalid author ID');
    }

    return this.getSubIdeas({ ...filters, authorId });
  }

  /**
   * Gets sub-idea statistics
   */
  async getSubIdeaStats(authorId = null, ideaId = null) {
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
        matchStage.ideaId = new mongoose.Types.ObjectId(ideaId);
      }

      const stats = await SubIdea.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalSubIdeas: { $sum: 1 },
            openForPrototyping: {
              $sum: { $cond: [{ $eq: ['$status', 'OPEN_FOR_PROTOTYPING'] }, 1, 0] }
            },
            selfPrototyping: {
              $sum: { $cond: [{ $eq: ['$status', 'SELF_PROTOTYPING'] }, 1, 0] }
            }
          }
        }
      ]);

      // Get proposal counts for sub-ideas
      const { Proposal } = await import('../models/index.js');
      const proposalStats = await Proposal.aggregate([
        ...(Object.keys(matchStage).length > 0 ? [
          {
            $lookup: {
              from: 'subideas',
              localField: 'subIdeaId',
              foreignField: '_id',
              as: 'subIdea'
            }
          },
          { $unwind: '$subIdea' },
          { $match: Object.fromEntries(Object.entries(matchStage).map(([key, value]) => [`subIdea.${key}`, value])) }
        ] : []),
        {
          $group: {
            _id: null,
            totalProposals: { $sum: 1 }
          }
        }
      ]);

      const baseStats = stats[0] || {
        totalSubIdeas: 0,
        openForPrototyping: 0,
        selfPrototyping: 0
      };

      const proposalCount = proposalStats[0]?.totalProposals || 0;

      return {
        ...baseStats,
        totalProposals: proposalCount,
        avgProposalsPerSubIdea: baseStats.totalSubIdeas > 0 ? 
          Math.round((proposalCount / baseStats.totalSubIdeas) * 100) / 100 : 0
      };
    } catch (error) {
      console.error('Database error in getSubIdeaStats:', error);
      throw new Error('Failed to fetch sub-idea statistics');
    }
  }

  /**
   * Changes sub-idea status
   */
  async changeSubIdeaStatus(subIdeaId, newStatus, userId, userRole) {
    // Validate input
    if (!Object.values(SubIdeaStatus).includes(newStatus)) {
      throw new Error('Invalid status value');
    }

    // Validate ID
    if (!this.validateObjectId(subIdeaId)) {
      throw new Error('Invalid sub-idea ID');
    }

    try {
      // 1. Get existing sub-idea
      const existingSubIdea = await SubIdea.findById(subIdeaId).populate('idea');
      if (!existingSubIdea) {
        throw new Error('Sub-idea not found');
      }

      // 2. Check authorization (author, idea author, or admin can change status)
      const isAuthor = existingSubIdea.authorId.toString() === userId;
      const isIdeaAuthor = existingSubIdea.idea.authorId.toString() === userId;
      const isAdmin = userRole === 'ADMIN';

      if (!isAuthor && !isIdeaAuthor && !isAdmin) {
        throw new Error('Unauthorized: Only the sub-idea author, idea author, or admin can change status');
      }

      // 3. Update status
      const updatedSubIdea = await SubIdea.findByIdAndUpdate(
        subIdeaId,
        { status: newStatus },
        { new: true, runValidators: true }
      )
        .populate('author', 'name avatarUrl')
        .populate('idea', 'title status');

      return updatedSubIdea.toObject();
    } catch (error) {
      console.error('Database error in changeSubIdeaStatus:', error);
      
      if (error.message.includes('not found') || error.message.includes('Unauthorized')) {
        throw error;
      }
      
      throw new Error('Failed to change sub-idea status');
    }
  }
}

export default new SubIdeaService();