import mongoose from 'mongoose'

const GitHubRepositoryChunkSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GitHubRepositorySource',
      required: true,
      index: true,
    },
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    repoUrl: { type: String, required: true },
    ref: { type: String, required: true },
    commitSha: { type: String, required: true },
    filePath: { type: String, required: true },
    fileType: { type: String },
    language: { type: String },
    chunkIndex: { type: Number, required: true },
    sourcePath: { type: String, required: true },
    content: { type: String, required: true },
    charCount: { type: Number, required: true },
    byteCount: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

GitHubRepositoryChunkSchema.index({ conversationId: 1, createdAt: -1 })
GitHubRepositoryChunkSchema.index({ conversationId: 1, filePath: 1 })

export type GitHubRepositoryChunkDoc =
  mongoose.InferSchemaType<typeof GitHubRepositoryChunkSchema> & { _id: mongoose.Types.ObjectId }

export const GitHubRepositoryChunk = mongoose.models.GitHubRepositoryChunk
  ?? mongoose.model('GitHubRepositoryChunk', GitHubRepositoryChunkSchema)

