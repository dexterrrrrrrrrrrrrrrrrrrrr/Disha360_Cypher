import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);
export async function connectDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, autoIndex: process.env.NODE_ENV !== 'production' });
}
export function databaseStatus(): 'connected' | 'connecting' | 'disconnected' {
  return mongoose.connection.readyState === 1 ? 'connected' : mongoose.connection.readyState === 2 ? 'connecting' : 'disconnected';
}
export async function disconnectDatabase(): Promise<void> { await mongoose.disconnect(); }
