import mongoose from 'mongoose'

const SubagentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    prompt: { type: String, required: true },
    model: { type: String },
    effort: { type: String },
    permissionMode: { type: String },
    tools: { type: [String] },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type SubagentDoc = mongoose.InferSchemaType<typeof SubagentSchema> & { _id: mongoose.Types.ObjectId }

export const Subagent = mongoose.models.Subagent ?? mongoose.model('Subagent', SubagentSchema)
