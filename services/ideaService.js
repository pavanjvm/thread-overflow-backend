import mongoose from 'mongoose';
import { Idea, User } from '../models/index.js';
import { IdeaType, IdeaStatus } from '../models/enums.js';

class IdeaService {
  /**
   * Validates idea creation input
   */
  validateIdeaInput(title, description, type, potentialDollarValue) {
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

    if (!type || !Object.values(IdeaType).includes(type)) {
      errors.push('Type must be either IDEATION or SOLUTION_REQUEST');
    }

    if (potentialDollarValue !== null && potentialDollarValue !== undefined) {
      if (typeof potentialDollarValue !== 'number' || potentialDollarValue < 0) {
        errors.push('Potential dollar value must be a positive number');
      }
    }

    return errors;
  }

  /**
   * Validates idea update input
   */
  validateIdeaUpdateInput(title, description, potentialDollarValue, status) {
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

    if (potentialDollarValue !== undefined && potentialDollarValue !== null) {
      if (typeof potentialDollarValue !== 'number' || potentialDollarValue < 0) {
        errors.push('Potential dollar value must be a positive number');
      }
    }

    if (status !== undefined && !Object.values(IdeaStatus).includes(status)) {
      errors.push('Status must be either OPEN or CLOSED');
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
   * Creates a new idea
   */
  async createIdea(ideaData, authorId) {
    const { title, description, type, potentialDollarValue } = ideaData;

    // Validate input
    const validationErrors = this.validateIdeaInput(title, description, type, potentialDollarValue);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate author exists
    if (!this.validateObjectId(authorId)) {
      throw new Error('Invalid author ID');
    }

    const author = await User.findById(authorId).exec();
    if (!author) {
      throw new Error('Author not found');
    }

    try {
      // Sanitize inputs
      const sanitizedTitle = this.sanitizeInput(title);
      const sanitizedDescription = this.sanitizeInput(description);

      // Create new idea
      const newIdea = new Idea({
        title: sanitizedTitle,
        description: sanitizedDescription,
        type,
        potentialDollarValue: potentialDollarValue || null,
        authorId,
        status: IdeaStatus.OPEN
      });

      const savedIdea = await newIdea.save();

      // Populate author information
      await savedIdea.populate('author', 'name avatarUrl');

      return savedIdea.toObject();
    } catch (error) {
      console.error('Database error in createIdea:', error);
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to create idea');
    }
  }

  /**
   * Gets ideas with filtering, pagination, and search
   */
  async getIdeas(filters = {}) {
    try {
      const {
        status = IdeaStatus.OPEN,
        type,
        authorId,
        search,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Build query
      const query = {};

      // Status filter
      if (status && Object.values(IdeaStatus).includes(status.toUpperCase())) {
        query.status = status.toUpperCase();
      }

      // Type filter
      if (type && Object.values(IdeaType).includes(type.toUpperCase())) {
        query.type = type.toUpperCase();
      }

      // Author filter
      if (authorId) {
        if (!this.validateObjectId(authorId)) {
          throw new Error('Invalid author ID');
        }
        query.authorId = authorId;
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
      const [ideas, totalCount] = await Promise.all([
        Idea.find(query)
          .populate('author', 'name avatarUrl')
          .select('title type description createdAt totalProposals totalPrototypes status potentialDollarValue')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .exec(),
        Idea.countDocuments(query)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limitNum);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        ideas: ideas.map(idea => idea.toObject()),
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
      console.error('Database error in getIdeas:', error);
      throw new Error('Failed to fetch ideas');
    }
  }

  /**
   * Gets a single idea by ID
   */
  async getIdeaById(ideaId) {
    // Validate ID
    if (!this.validateObjectId(ideaId)) {
      throw new Error('Invalid idea ID');
    }

    try {
      const idea = await Idea.findById(ideaId)
        .populate('author', 'name avatarUrl')
        .select('title description potentialDollarValue createdAt status type totalProposals totalPrototypes')
        .exec();

      if (!idea) {
        throw new Error('Idea not found');
      }

      return idea.toObject();
    } catch (error) {
      console.error('Database error in getIdeaById:', error);
      
      if (error.message === 'Idea not found') {
        throw error;
      }
      
      throw new Error('Failed to fetch idea');
    }
  }

  /**
   * Updates an idea
   */
  async updateIdea(ideaId, updateData, userId, userRole) {
    // Validate ID
    if (!this.validateObjectId(ideaId)) {
      throw new Error('Invalid idea ID');
    }

    // Find existing idea
    const existingIdea = await Idea.findById(ideaId).exec();
    if (!existingIdea) {
      throw new Error('Idea not found');
    }

    // Check authorization (only author or admin can update)
    if (existingIdea.authorId.toString() !== userId && userRole !== 'ADMIN') {
      throw new Error('Unauthorized to update this idea');
    }

    const { title, description, potentialDollarValue, status } = updateData;

    // Validate input
    const validationErrors = this.validateIdeaUpdateInput(title, description, potentialDollarValue, status);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    try {
      const updateFields = {};

      if (title !== undefined) {
        updateFields.title = this.sanitizeInput(title);
      }
      if (description !== undefined) {
        updateFields.description = this.sanitizeInput(description);
      }
      if (potentialDollarValue !== undefined) {
        updateFields.potentialDollarValue = potentialDollarValue;
      }
      if (status !== undefined) {
        updateFields.status = status;
      }

      const updatedIdea = await Idea.findByIdAndUpdate(
        ideaId,
        updateFields,
        { new: true, runValidators: true }
      )
        .populate('author', 'name avatarUrl')
        .exec();

      return updatedIdea.toObject();
    } catch (error) {
      console.error('Database error in updateIdea:', error);
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to update idea');
    }
  }

  /**
   * Deletes an idea
   */
  async deleteIdea(ideaId, userId, userRole) {
    // Validate ID
    if (!this.validateObjectId(ideaId)) {
      throw new Error('Invalid idea ID');
    }

    // Find existing idea
    const existingIdea = await Idea.findById(ideaId).exec();
    if (!existingIdea) {
      throw new Error('Idea not found');
    }

    // Check authorization (only author or admin can delete)
    if (existingIdea.authorId.toString() !== userId && userRole !== 'ADMIN') {
      throw new Error('Unauthorized to delete this idea');
    }

    try {
      await Idea.findByIdAndDelete(ideaId).exec();
      return { message: 'Idea deleted successfully' };
    } catch (error) {
      console.error('Database error in deleteIdea:', error);
      throw new Error('Failed to delete idea');
    }
  }

  /**
   * Gets ideas by author
   */
  async getIdeasByAuthor(authorId, filters = {}) {
    if (!this.validateObjectId(authorId)) {
      throw new Error('Invalid author ID');
    }

    return this.getIdeas({ ...filters, authorId });
  }

  /**
   * Gets idea statistics
   */
  async getIdeaStats(authorId = null) {
    try {
      const matchStage = authorId ? { authorId: new mongoose.Types.ObjectId(authorId) } : {};

      const stats = await Idea.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalIdeas: { $sum: 1 },
            openIdeas: {
              $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] }
            },
            closedIdeas: {
              $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] }
            },
            ideationCount: {
              $sum: { $cond: [{ $eq: ['$type', 'IDEATION'] }, 1, 0] }
            },
            solutionRequestCount: {
              $sum: { $cond: [{ $eq: ['$type', 'SOLUTION_REQUEST'] }, 1, 0] }
            },
            totalProposals: { $sum: '$totalProposals' },
            totalPrototypes: { $sum: '$totalPrototypes' },
            avgPotentialValue: { $avg: '$potentialDollarValue' }
          }
        }
      ]);

      return stats[0] || {
        totalIdeas: 0,
        openIdeas: 0,
        closedIdeas: 0,
        ideationCount: 0,
        solutionRequestCount: 0,
        totalProposals: 0,
        totalPrototypes: 0,
        avgPotentialValue: 0
      };
    } catch (error) {
      console.error('Database error in getIdeaStats:', error);
      throw new Error('Failed to fetch idea statistics');
    }
  }
}

export default new IdeaService();