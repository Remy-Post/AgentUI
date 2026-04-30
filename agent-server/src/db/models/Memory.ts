import mongoose from 'mongoose'

const MemorySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ['preference', 'fact', 'project', 'instruction', 'note'],
      required: true,
      default: 'note',
      index: true,
    },
    tags: { type: [String], default: [], index: true },
    sourceConversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    sourceMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true },
)

MemorySchema.index({ title: 'text', content: 'text', tags: 'text' })
MemorySchema.index({ type: 1, updatedAt: -1 })
MemorySchema.index({ updatedAt: -1 })

export type MemoryDoc = mongoose.InferSchemaType<typeof MemorySchema> & {
  _id: mongoose.Types.ObjectId
}

export const Memory = mongoose.models.Memory ?? mongoose.model('Memory', MemorySchema)
