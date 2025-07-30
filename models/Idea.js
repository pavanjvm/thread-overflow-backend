import mongoose from 'mongoose';
import { IdeaType, IdeaStatus } from './enums.js';

const ideaSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000
  },
  type: {
    type: String,
    enum: Object.values(IdeaType),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(IdeaStatus),
    required: true
  },
  potentialDollarValue: {
    type: Number,
    min: 0,
    default: null
  },
  totalProposals: {
    type: Number,
    default: 0,
    min: 0
  },
  totalPrototypes: {
    type: Number,
    default: 0,
    min: 0
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
ideaSchema.index({ authorId: 1 });
ideaSchema.index({ status: 1 });
ideaSchema.index({ type: 1 });
ideaSchema.index({ createdAt: -1 });
ideaSchema.index({ potentialDollarValue: -1 });

// Virtual for id
ideaSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual to populate author
ideaSchema.virtual('author', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate subIdeas
ideaSchema.virtual('subIdeas', {
  ref: 'SubIdea',
  localField: '_id',
  foreignField: 'ideaId'
});

ideaSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Idea', ideaSchema);