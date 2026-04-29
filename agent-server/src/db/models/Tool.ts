import mongoose from 'mongoose'

const ToolSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type ToolDoc = mongoose.InferSchemaType<typeof ToolSchema> & { _id: mongoose.Types.ObjectId }

export const Tool = mongoose.models.Tool ?? mongoose.model('Tool', ToolSchema)
