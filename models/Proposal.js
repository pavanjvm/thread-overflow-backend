import mongoose from 'mongoose';
import { ProposalStatus } from './enums.js';

const proposalSchema = new mongoose.Schema({
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
  presentationUrl: {
    type: String,
    default: null,
    validate: {
      validator: function(url) {
        if (!url) return true;
        return /^https?:\/\/.+/.test(url);
      },
      message: 'Please provide a valid URL'
    }
  },
  status: {
    type: String,
    enum: Object.values(ProposalStatus),
    default: ProposalStatus.PENDING
  },
  rejectionReason: {
    type: String,
    default: null,
    maxlength: 500
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subIdeaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubIdea',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
proposalSchema.index({ authorId: 1 });
proposalSchema.index({ subIdeaId: 1 });
proposalSchema.index({ status: 1 });
proposalSchema.index({ createdAt: -1 });

// Virtual for id
proposalSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual to populate author
proposalSchema.virtual('author', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate subIdea
proposalSchema.virtual('subIdea', {
  ref: 'SubIdea',
  localField: 'subIdeaId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate prototypes
proposalSchema.virtual('prototypes', {
  ref: 'Prototype',
  localField: '_id',
  foreignField: 'proposalId'
});

// Virtual to populate votes
proposalSchema.virtual('votes', {
  ref: 'Vote',
  localField: '_id',
  foreignField: 'proposalId'
});

proposalSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Proposal', proposalSchema);