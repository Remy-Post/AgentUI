import mongoose from 'mongoose'

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/agent-desk'

let connectingPromise: Promise<typeof mongoose> | null = null

export async function connectDb(uri: string = process.env.MONGODB_URI ?? DEFAULT_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose
  if (connectingPromise) return connectingPromise

  connectingPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  })

  try {
    await connectingPromise
    return mongoose
  } finally {
    connectingPromise = null
  }
}

export function dbStatus(): 'up' | 'down' {
  return mongoose.connection.readyState === 1 ? 'up' : 'down'
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}
