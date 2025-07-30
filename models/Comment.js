import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  authorId: {
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
  prototypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prototype',
    default: null
  }
}, {
  timestamps: true
});

// Indexes
commentSchema.index({ authorId: 1 });
commentSchema.index({ subIdeaId: 1 });
commentSchema.index({ prototypeId: 1 });
commentSchema.index({ createdAt: -1 });

// Validation to ensure exactly one target is set
commentSchema.pre('save', function(next) {
  const targets = [this.subIdeaId, this.prototypeId].filter(Boolean);
  if (targets.length !== 1) {
    next(new Error('Comment must target exactly one entity (subIdea or prototype)'));
  } else {
    next();
  }
});

// Virtual for id
commentSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual to populate author
commentSchema.virtual('author', {
  ref: 'User',
  localField: 'authorId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate subIdea
commentSchema.virtual('subIdea', {
  ref: 'SubIdea',
  localField: 'subIdeaId',
  foreignField: '_id',
  justOne: true
});

// Virtual to populate prototype
commentSchema.virtual('prototype', {
  ref: 'Prototype',
  localField: 'prototypeId',
  foreignField: '_id',
  justOne: true
});

commentSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Comment', commentSchema);