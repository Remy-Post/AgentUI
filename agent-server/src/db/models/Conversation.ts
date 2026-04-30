import mongoose from 'mongoose'

const ConversationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: 'New conversation' },
    model: { type: String, required: true },
    sdkSessionId: { type: String },
    totalCostUsd: { type: Number, default: 0 },
    totalInputTokens: { type: Number, default: 0 },
    totalOutputTokens: { type: Number, default: 0 },
    totalCacheCreationInputTokens: { type: Number, default: 0 },
    totalCacheReadInputTokens: { type: Number, default: 0 },
    effort: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    attachedSkillIds: { type: [String], default: [] },
    attachedSubagentIds: { type: [String], default: [] },
    description: { type: String, default: '' },
    color: {
      type: String,
      enum: ['slate', 'sky', 'emerald', 'amber', 'rose', 'violet', 'stone', null],
      default: null,
    },
  },
  { timestamps: true },
)

export type ConversationDoc = mongoose.InferSchemaType<typeof ConversationSchema> & { _id: mongoose.Types.ObjectId }

export const Conversation = mongoose.models.Conversation
  ?? mongoose.model('Conversation', ConversationSchema)
