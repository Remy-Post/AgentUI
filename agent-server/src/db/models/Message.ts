import mongoose from 'mongoose'

const MessageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'tool', 'system'], required: true },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    costUsd: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export type MessageDoc = mongoose.InferSchemaType<typeof MessageSchema> & { _id: mongoose.Types.ObjectId }

export const Message = mongoose.models.Message ?? mongoose.model('Message', MessageSchema)
