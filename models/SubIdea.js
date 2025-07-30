import mongoose from 'mongoose';
import { SubIdeaStatus } from './enums.js';

const subIdeaSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: Object.values(SubIdeaStatus),
    required: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ideaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Idea',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
subIdeaSchema.index({ authorId: 1 });
subIdeaSchema.index({ ideaId: 1 });
subIdeaSchema.index({ status: 1 });
subIdeaSchema.index({ createdAt: -1 });

// Virtual for id
subIdeaSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual to populate author
subIdeaSchema.virtual('author', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate idea
subIdeaSchema.virtual('idea', {
  ref: 'Idea',
  localField: 'ideaId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate proposals
subIdeaSchema.virtual('proposals', {
  ref: 'Proposal',
  localField: '_id',
  foreignField: 'subIdeaId'
});

// Virtual to populate votes
subIdeaSchema.virtual('votes', {
  ref: 'Vote',
  localField: '_id',
  foreignField: 'subIdeaId'
});

// Virtual to populate comments
subIdeaSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'subIdeaId'
});

subIdeaSchema.set('toJSON', { virtuals: true });

export default mongoose.model('SubIdea', subIdeaSchema);