import mongoose from 'mongoose'

const ConversationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: 'New conversation' },
    model: { type: String, required: true },
  },
  { timestamps: true },
)

export type ConversationDoc = mongoose.InferSchemaType<typeof ConversationSchema> & { _id: mongoose.Types.ObjectId }

export const Conversation = mongoose.models.Conversation
  ?? mongoose.model('Conversation', ConversationSchema)
