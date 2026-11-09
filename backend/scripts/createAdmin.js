require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const { validateEnv } = require("../config/env");
const User = require("../models/user");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createInitialAdmin = async (environment = process.env) => {
  validateEnv(environment);

  const name = environment.ADMIN_NAME;
  const email = environment.ADMIN_EMAIL;
  const password = environment.ADMIN_PASSWORD;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof email !== "string" ||
    !emailPattern.test(email.trim()) ||
    typeof password !== "string" ||
    password.length < 12
  ) {
    throw new Error(
      "Set ADMIN_NAME, a valid ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters"
    );
  }

  let connected = false;

  try {
    await connectDB();
    connected = true;

    if (await User.exists({ role: "Admin" })) {
      throw new Error("An Admin account already exists; bootstrap is one-time only");
    }

    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: await bcrypt.hash(password, 12),
      role: "Admin",
      isActive: true,
    });

    console.log(`Initial Admin created for ${user.email}`);
  } finally {
    if (connected) {
      await mongoose.disconnect();
    }
  }
};

if (require.main === module) {
  createInitialAdmin().catch((error) => {
    console.error("Admin bootstrap failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { createInitialAdmin };
