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
    disallowedTools: { type: [String] },
    mcpServices: { type: [String] },
    memory: { type: String, enum: ['user', 'project', 'local', 'none'], default: 'local' },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type SubagentDoc = mongoose.InferSchemaType<typeof SubagentSchema> & { _id: mongoose.Types.ObjectId }

export const Subagent: mongoose.Model<SubagentDoc> =
  (mongoose.models.Subagent as mongoose.Model<SubagentDoc> | undefined) ?? mongoose.model<SubagentDoc>('Subagent', SubagentSchema)
