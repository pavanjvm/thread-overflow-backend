import mongoose from 'mongoose';

const prototypeTeamMemberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const prototypeSchema = new mongoose.Schema({
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
  imageUrl: {
    type: String,
    required: true,
    validate: {
      validator: function(url) {
        return /^https?:\/\/.+/.test(url);
      },
      message: 'Please provide a valid image URL'
    }
  },
  liveUrl: {
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
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  proposalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal',
    required: true
  },
  team: [prototypeTeamMemberSchema]
}, {
  timestamps: true
});

// Indexes
prototypeSchema.index({ authorId: 1 });
prototypeSchema.index({ proposalId: 1 });
prototypeSchema.index({ 'team.userId': 1 });
prototypeSchema.index({ createdAt: -1 });

// Virtual for id
prototypeSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual to populate author
prototypeSchema.virtual('author', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate proposal
prototypeSchema.virtual('proposal', {
  ref: 'Proposal',
  localField: 'proposalId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate votes
prototypeSchema.virtual('votes', {
  ref: 'Vote',
  localField: '_id',
  foreignField: 'prototypeId'
});

// Virtual to populate comments
prototypeSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'prototypeId'
});

prototypeSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Prototype', prototypeSchema);