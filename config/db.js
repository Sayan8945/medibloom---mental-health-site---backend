const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
    });
    // Log only the host, never the full URI (which contains the password)
    console.log(`[db] Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`[db] Connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
