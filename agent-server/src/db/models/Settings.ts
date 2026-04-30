import mongoose from 'mongoose'
import { DEFAULT_MODEL_CLASS, MODEL_CLASSES } from '../../../util/vars.ts'

const SettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    // Stored as a class identifier ("opus" | "sonnet" | "haiku"); the latest
    // model ID for that class is resolved at read time so users automatically
    // pick up new releases when MODELS is updated.
    defaultModel: { type: String, enum: [...MODEL_CLASSES], default: DEFAULT_MODEL_CLASS },
    // Budget toggles. Both default off; the renderer only surfaces the
    // toggles when the active default model supports the underlying feature.
    useOneMillionContext: { type: Boolean, default: false },
    useFastMode: { type: Boolean, default: false },
    autoMemoryEnabled: { type: Boolean, default: true },
    autoMemoryDirectory: { type: String, default: '' },
    autoDreamEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export type SettingsDoc = mongoose.InferSchemaType<typeof SettingsSchema> & { _id: mongoose.Types.ObjectId }

export const Settings = mongoose.models.Settings ?? mongoose.model('Settings', SettingsSchema)
