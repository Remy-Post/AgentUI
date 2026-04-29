import mongoose from 'mongoose'

const ToolSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    label: { type: String, default: '' },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    category: { type: String, default: 'other' },
    kind: { type: String, default: 'sdk' },
    order: { type: Number, default: 0 },
    quickRank: { type: Number },
    locked: { type: Boolean, default: false },
    permission: { type: String, default: '' },
  },
  { timestamps: true },
)

export type ToolDoc = mongoose.InferSchemaType<typeof ToolSchema> & { _id: mongoose.Types.ObjectId }

export const Tool = mongoose.models.Tool ?? mongoose.model('Tool', ToolSchema)
