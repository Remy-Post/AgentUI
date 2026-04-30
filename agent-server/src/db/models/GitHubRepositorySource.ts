import mongoose from 'mongoose'

const GitHubRepositorySourceSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    repoUrl: { type: String, required: true },
    defaultBranch: { type: String, required: true },
    ref: { type: String, required: true },
    commitSha: { type: String, required: true },
    private: { type: Boolean, default: false },
    treeTruncated: { type: Boolean, default: false },
    selectedPaths: { type: [String], default: [] },
    ingestedFileCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

GitHubRepositorySourceSchema.index({ conversationId: 1, owner: 1, repo: 1, ref: 1 })

export type GitHubRepositorySourceDoc =
  mongoose.InferSchemaType<typeof GitHubRepositorySourceSchema> & { _id: mongoose.Types.ObjectId }

export const GitHubRepositorySource = mongoose.models.GitHubRepositorySource
  ?? mongoose.model('GitHubRepositorySource', GitHubRepositorySourceSchema)

