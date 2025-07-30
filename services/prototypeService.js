import mongoose from 'mongoose';
import { Prototype, Proposal, SubIdea, Idea, User } from '../models/index.js';
import { ProposalStatus } from '../models/enums.js';

class PrototypeService {
  /**
   * Validates prototype creation input
   */
  validatePrototypeInput(title, description, imageUrl, liveUrl) {
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

    if (!imageUrl || typeof imageUrl !== 'string') {
      errors.push('Image URL is required');
    } else {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(imageUrl)) {
        errors.push('Image URL must be a valid HTTP/HTTPS URL');
      }
    }

    if (liveUrl && typeof liveUrl === 'string') {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(liveUrl)) {
        errors.push('Live URL must be a valid HTTP/HTTPS URL');
      }
    }

    return errors;
  }

  /**
   * Validates prototype update input
   */
  validatePrototypeUpdateInput(title, description, imageUrl, liveUrl) {
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

    if (imageUrl !== undefined) {
      if (!imageUrl || typeof imageUrl !== 'string') {
        errors.push('Image URL is required');
      } else {
        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(imageUrl)) {
          errors.push('Image URL must be a valid HTTP/HTTPS URL');
        }
      }
    }

    if (liveUrl !== undefined && liveUrl !== null && liveUrl !== '') {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(liveUrl)) {
        errors.push('Live URL must be a valid HTTP/HTTPS URL');
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
   * Creates a new prototype
   */
  async createPrototype(prototypeData, authorId) {
    const { title, description, imageUrl, liveUrl, proposalId } = prototypeData;

    // Validate input
    const validationErrors = this.validatePrototypeInput(title, description, imageUrl, liveUrl);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate IDs
    if (!this.validateObjectId(authorId)) {
      throw new Error('Invalid author ID');
    }
    if (!this.validateObjectId(proposalId)) {
      throw new Error('Invalid proposal ID');
    }

    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        // 1. Verify author exists
        const author = await User.findById(authorId).session(session);
        if (!author) {
          throw new Error('Author not found');
        }

        // 2. Verify proposal exists and is accepted
        const proposal = await Proposal.findById(proposalId)
          .populate({
            path: 'subIdea',
            populate: { path: 'idea' }
          })
          .session(session);
        
        if (!proposal) {
          throw new Error('Proposal not found');
        }

        if (proposal.status !== ProposalStatus.ACCEPTED) {
          throw new Error('Prototypes can only be created for accepted proposals');
        }

        // 3. Check if user already has a prototype for this proposal
        const existingPrototype = await Prototype.findOne({
          authorId,
          proposalId
        }).session(session);

        if (existingPrototype) {
          throw new Error('You already have a prototype for this proposal');
        }

        // 4. Sanitize inputs
        const sanitizedTitle = this.sanitizeInput(title);
        const sanitizedDescription = this.sanitizeInput(description);
        const sanitizedImageUrl = this.sanitizeInput(imageUrl);
        const sanitizedLiveUrl = liveUrl ? this.sanitizeInput(liveUrl) : null;

        // 5. Create prototype
        const newPrototype = new Prototype({
          title: sanitizedTitle,
          description: sanitizedDescription,
          imageUrl: sanitizedImageUrl,
          liveUrl: sanitizedLiveUrl,
          authorId,
          proposalId,
          team: [{ userId: authorId }] // Author is automatically part of the team
        });

        const savedPrototype = await newPrototype.save({ session });

        // 6. Increment totalPrototypes counter on parent idea
        const ideaId = proposal.subIdea.ideaId;
        await Idea.findByIdAndUpdate(
          ideaId,
          { $inc: { totalPrototypes: 1 } },
          { session }
        );

        // 7. Populate author and proposal info
        await savedPrototype.populate([
          { path: 'author', select: 'name avatarUrl' },
          { path: 'proposal', select: 'title' }
        ]);

        return savedPrototype.toObject();
      });

      return result;
    } catch (error) {
      console.error('Database error in createPrototype:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('already have') ||
          error.message.includes('can only be created')) {
        throw error;
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to create prototype');
    } finally {
      await session.endSession();
    }
  }

  /**
   * Gets prototypes with filtering and pagination
   */
  async getPrototypes(filters = {}) {
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
      } = filters;

      // Build query
      const query = {};

      // Filter by idea (get all prototypes for proposals under sub-ideas under this idea)
      if (ideaId) {
        if (!this.validateObjectId(ideaId)) {
          throw new Error('Invalid idea ID');
        }
        
        const subIdeas = await SubIdea.find({ ideaId }).select('_id');
        const subIdeaIds = subIdeas.map(sub => sub._id);
        
        const proposals = await Proposal.find({ 
          subIdeaId: { $in: subIdeaIds },
          status: ProposalStatus.ACCEPTED 
        }).select('_id');
        const proposalIds = proposals.map(prop => prop._id);
        
        query.proposalId = { $in: proposalIds };
      }

      // Filter by specific proposal
      if (proposalId) {
        if (!this.validateObjectId(proposalId)) {
          throw new Error('Invalid proposal ID');
        }
        query.proposalId = proposalId;
      }

      // Filter by author
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
      const [prototypes, totalCount] = await Promise.all([
        Prototype.find(query)
          .populate('author', 'name avatarUrl')
          .populate('proposal', 'title')
          .populate('team.userId', 'name avatarUrl')
          .select('title description imageUrl liveUrl createdAt updatedAt')
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .exec(),
        Prototype.countDocuments(query)
      ]);

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limitNum);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        prototypes: prototypes.map(prototype => prototype.toObject()),
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
      console.error('Database error in getPrototypes:', error);
      throw new Error('Failed to fetch prototypes');
    }
  }

  /**
   * Gets prototypes for a specific idea
   */
  async getPrototypesForIdea(ideaId, filters = {}) {
    return this.getPrototypes({ ...filters, ideaId });
  }

  /**
   * Gets a single prototype by ID
   */
  async getPrototypeById(prototypeId) {
    if (!this.validateObjectId(prototypeId)) {
      throw new Error('Invalid prototype ID');
    }

    try {
      const prototype = await Prototype.findById(prototypeId)
        .populate('author', 'name avatarUrl')
        .populate({
          path: 'proposal',
          select: 'title',
          populate: {
            path: 'subIdea',
            select: 'title',
            populate: {
              path: 'idea',
              select: 'title authorId'
            }
          }
        })
        .populate('team.userId', 'name avatarUrl')
        .exec();

      if (!prototype) {
        throw new Error('Prototype not found');
      }

      return prototype.toObject();
    } catch (error) {
      console.error('Database error in getPrototypeById:', error);
      
      if (error.message === 'Prototype not found') {
        throw error;
      }
      
      throw new Error('Failed to fetch prototype');
    }
  }

  /**
   * Updates a prototype
   */
  async updatePrototype(prototypeId, updateData, userId) {
    const { title, description, imageUrl, liveUrl } = updateData;

    // Validate input
    const validationErrors = this.validatePrototypeUpdateInput(title, description, imageUrl, liveUrl);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Validate ID
    if (!this.validateObjectId(prototypeId)) {
      throw new Error('Invalid prototype ID');
    }

    try {
      // 1. Get existing prototype
      const existingPrototype = await Prototype.findById(prototypeId);
      if (!existingPrototype) {
        throw new Error('Prototype not found');
      }

      // 2. Check authorization - only author or team members can update
      const isAuthor = existingPrototype.authorId.toString() === userId;
      const isTeamMember = existingPrototype.team.some(member => 
        member.userId.toString() === userId
      );

      if (!isAuthor && !isTeamMember) {
        throw new Error('Unauthorized: Only the prototype author or team members can update this prototype');
      }

      // 3. Update prototype
      const updateFields = {};
      if (title !== undefined) updateFields.title = this.sanitizeInput(title);
      if (description !== undefined) updateFields.description = this.sanitizeInput(description);
      if (imageUrl !== undefined) updateFields.imageUrl = this.sanitizeInput(imageUrl);
      if (liveUrl !== undefined) updateFields.liveUrl = liveUrl ? this.sanitizeInput(liveUrl) : null;

      const updatedPrototype = await Prototype.findByIdAndUpdate(
        prototypeId,
        updateFields,
        { new: true, runValidators: true }
      )
        .populate('author', 'name avatarUrl')
        .populate('proposal', 'title')
        .populate('team.userId', 'name avatarUrl');

      return updatedPrototype.toObject();
    } catch (error) {
      console.error('Database error in updatePrototype:', error);
      
      if (error.message.includes('not found') || error.message.includes('Unauthorized')) {
        throw error;
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to update prototype');
    }
  }

  /**
   * Deletes a prototype
   */
  async deletePrototype(prototypeId, userId, userRole) {
    // Validate ID
    if (!this.validateObjectId(prototypeId)) {
      throw new Error('Invalid prototype ID');
    }

    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction(async () => {
        // 1. Get existing prototype with related data
        const existingPrototype = await Prototype.findById(prototypeId)
          .populate({
            path: 'proposal',
            populate: {
              path: 'subIdea',
              populate: { path: 'idea' }
            }
          })
          .session(session);
        
        if (!existingPrototype) {
          throw new Error('Prototype not found');
        }

        // 2. Check authorization
        if (existingPrototype.authorId.toString() !== userId && userRole !== 'ADMIN') {
          throw new Error('Unauthorized: Only the prototype author or admin can delete this prototype');
        }

        // 3. Delete prototype
        await Prototype.findByIdAndDelete(prototypeId).session(session);

        // 4. Decrement totalPrototypes counter on parent idea
        const ideaId = existingPrototype.proposal.subIdea.ideaId;
        await Idea.findByIdAndUpdate(
          ideaId,
          { $inc: { totalPrototypes: -1 } },
          { session }
        );

        return { message: 'Prototype deleted successfully' };
      });

      return result;
    } catch (error) {
      console.error('Database error in deletePrototype:', error);
      
      if (error.message.includes('not found') || error.message.includes('Unauthorized')) {
        throw error;
      }
      
      throw new Error('Failed to delete prototype');
    } finally {
      await session.endSession();
    }
  }

  /**
   * Adds team member to prototype
   */
  async addTeamMember(prototypeId, userId, requesterId) {
    // Validate IDs
    if (!this.validateObjectId(prototypeId)) {
      throw new Error('Invalid prototype ID');
    }
    if (!this.validateObjectId(userId)) {
      throw new Error('Invalid user ID');
    }

    try {
      // 1. Get existing prototype
      const existingPrototype = await Prototype.findById(prototypeId);
      if (!existingPrototype) {
        throw new Error('Prototype not found');
      }

      // 2. Check authorization - only author can add team members
      if (existingPrototype.authorId.toString() !== requesterId) {
        throw new Error('Unauthorized: Only the prototype author can add team members');
      }

      // 3. Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 4. Check if user is already a team member
      const isAlreadyMember = existingPrototype.team.some(member => 
        member.userId.toString() === userId
      );
      if (isAlreadyMember) {
        throw new Error('User is already a team member');
      }

      // 5. Add team member
      const updatedPrototype = await Prototype.findByIdAndUpdate(
        prototypeId,
        { $push: { team: { userId } } },
        { new: true }
      )
        .populate('author', 'name avatarUrl')
        .populate('team.userId', 'name avatarUrl');

      return updatedPrototype.toObject();
    } catch (error) {
      console.error('Database error in addTeamMember:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('Unauthorized') ||
          error.message.includes('already a team member')) {
        throw error;
      }
      
      throw new Error('Failed to add team member');
    }
  }

  /**
   * Removes team member from prototype
   */
  async removeTeamMember(prototypeId, userId, requesterId) {
    // Validate IDs
    if (!this.validateObjectId(prototypeId)) {
      throw new Error('Invalid prototype ID');
    }
    if (!this.validateObjectId(userId)) {
      throw new Error('Invalid user ID');
    }

    try {
      // 1. Get existing prototype
      const existingPrototype = await Prototype.findById(prototypeId);
      if (!existingPrototype) {
        throw new Error('Prototype not found');
      }

      // 2. Check authorization - author or the user themselves can remove
      const isAuthor = existingPrototype.authorId.toString() === requesterId;
      const isSelf = userId === requesterId;
      
      if (!isAuthor && !isSelf) {
        throw new Error('Unauthorized: Only the prototype author or the user themselves can remove team members');
      }

      // 3. Cannot remove the author
      if (userId === existingPrototype.authorId.toString()) {
        throw new Error('Cannot remove the prototype author from the team');
      }

      // 4. Remove team member
      const updatedPrototype = await Prototype.findByIdAndUpdate(
        prototypeId,
        { $pull: { team: { userId } } },
        { new: true }
      )
        .populate('author', 'name avatarUrl')
        .populate('team.userId', 'name avatarUrl');

      return updatedPrototype.toObject();
    } catch (error) {
      console.error('Database error in removeTeamMember:', error);
      
      if (error.message.includes('not found') || 
          error.message.includes('Unauthorized') ||
          error.message.includes('Cannot remove')) {
        throw error;
      }
      
      throw new Error('Failed to remove team member');
    }
  }

  /**
   * Gets prototype statistics
   */
  async getPrototypeStats(authorId = null, ideaId = null) {
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
        
        const proposals = await Proposal.find({ 
          subIdeaId: { $in: subIdeaIds },
          status: ProposalStatus.ACCEPTED 
        }).select('_id');
        const proposalIds = proposals.map(prop => prop._id);
        
        matchStage.proposalId = { $in: proposalIds };
      }

      const stats = await Prototype.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalPrototypes: { $sum: 1 },
            avgTeamSize: { $avg: { $size: '$team' } },
            prototypesWithLiveUrl: {
              $sum: { $cond: [{ $ne: ['$liveUrl', null] }, 1, 0] }
            },
            totalTeamMembers: { $sum: { $size: '$team' } }
          }
        }
      ]);

      return stats[0] || {
        totalPrototypes: 0,
        avgTeamSize: 0,
        prototypesWithLiveUrl: 0,
        totalTeamMembers: 0
      };
    } catch (error) {
      console.error('Database error in getPrototypeStats:', error);
      throw new Error('Failed to fetch prototype statistics');
    }
  }
}

export default new PrototypeService();