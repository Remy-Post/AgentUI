import mongoose from 'mongoose'

const SettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    defaultModel: { type: String, default: 'claude-sonnet-4' },
  },
  { timestamps: true },
)

export type SettingsDoc = mongoose.InferSchemaType<typeof SettingsSchema> & { _id: mongoose.Types.ObjectId }

export const Settings = mongoose.models.Settings ?? mongoose.model('Settings', SettingsSchema)
