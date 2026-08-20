import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const connectDB = async () => {
  try {

    await mongoose.connect(process.env.MONGO_URL);

    console.log('MongoDB connected');

  } catch (error) {

    console.error('MongoDB connection error:', error);

    process.exit(1);
  }
};

export default connectDB;