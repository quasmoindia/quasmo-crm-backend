import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/quasmo_crm';
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('MongoDB connection error:', message);
    process.exit(1);
  }
}
