import mongoose from 'mongoose';

const voteSchema = new mongoose.Schema({
  value: {
    type: Number,
    required: true,
    min: -1,
    max: 1
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Only one of these should be set (polymorphic relationship)
  subIdeaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubIdea',
    default: null
  },
  proposalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proposal',
    default: null
  },
  prototypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prototype',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for unique constraints
voteSchema.index({ userId: 1, subIdeaId: 1 }, { 
  unique: true, 
  partialFilterExpression: { subIdeaId: { $ne: null } }
});
voteSchema.index({ userId: 1, proposalId: 1 }, { 
  unique: true, 
  partialFilterExpression: { proposalId: { $ne: null } }
});
voteSchema.index({ userId: 1, prototypeId: 1 }, { 
  unique: true, 
  partialFilterExpression: { prototypeId: { $ne: null } }
});

// Other indexes
voteSchema.index({ userId: 1 });
voteSchema.index({ subIdeaId: 1 });
voteSchema.index({ proposalId: 1 });
voteSchema.index({ prototypeId: 1 });
voteSchema.index({ createdAt: -1 });

// Validation to ensure exactly one target is set
voteSchema.pre('save', function(next) {
  const targets = [this.subIdeaId, this.proposalId, this.prototypeId].filter(Boolean);
  if (targets.length !== 1) {
    next(new Error('Vote must target exactly one entity (subIdea, proposal, or prototype)'));
  } else {
    next();
  }
});

// Virtual for id
voteSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual to populate user
voteSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate subIdea
voteSchema.virtual('subIdea', {
  ref: 'SubIdea',
  localField: 'subIdeaId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate proposal
voteSchema.virtual('proposal', {
  ref: 'Proposal',
  localField: 'proposalId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate prototype
voteSchema.virtual('prototype', {
  ref: 'Prototype',
  localField: 'prototypeId',
  foreignField: '_id',
  justOne: true
});

voteSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Vote', voteSchema);