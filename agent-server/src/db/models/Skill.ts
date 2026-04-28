import mongoose from 'mongoose'

const SkillSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    body: { type: String, required: true, default: '' },
    parameters: { type: mongoose.Schema.Types.Mixed },
    allowedTools: { type: [String] },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type SkillDoc = mongoose.InferSchemaType<typeof SkillSchema> & { _id: mongoose.Types.ObjectId }

export const Skill = mongoose.models.Skill ?? mongoose.model('Skill', SkillSchema)
