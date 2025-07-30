import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    // Connection options
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000, 
      family: 4,
      bufferCommands: false,
      bufferMaxEntries: 0
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`🗄️  MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);

    // Connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });

    // Graceful close on app termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('🗄️  MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

export default connectDB;