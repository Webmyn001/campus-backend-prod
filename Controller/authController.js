const User = require("../Models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const cloudinary = require("../config/cloudinary");

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1d" });
};

console.log("sendEmail import test:", sendEmail)





// Signup
exports.signup = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
      email,
      password,
      name,
      verificationToken,
      verificationTokenExpires: Date.now() + 24 * 60 * 60 * 1000, // 24h
    });

    // Build verification link
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}&email=${email}`;

    // Send verification email
    await sendEmail(
      email,
      "Verify Your Email",
      `<p>Hello ${name || "User"},</p>

       <p>🎉 Welcome to our community! We’re excited to have you on board.</p>

       <p>To get started, please verify your email address by clicking the button below:</p>

      <p>
             <a href="${verificationUrl}" 
               style="display:inline-block; padding:10px 20px; background-color:#4F46E5; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold;">
            Verify Email
            </a>
        </p>

      <p>For your security, this link will expire in 24 hours. Don’t miss out on completing your registration.</p>

        <p>We can’t wait for you to explore everything we’ve prepared for you!</p>

          <p>Best regards,<br/>CampusCrave Team</p>
        `);

    const token = generateToken(user._id);

    res.status(201).json({
      message: "Signup successful. Please check your email to verify your account.",
      token,
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ success: false, message: "User not found." });
    }

    // If user already verified → just return success
    if (user.isVerified && !user.verificationToken) {
      return res
        .status(200)
        .json({ success: true, message: "Your email is already verified 🎉" });
    }

    // Otherwise check token
    if (user.verificationToken !== token) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid token or email." });
    }

    if (user.verificationTokenExpires < Date.now()) {
      return res
        .status(400)
        .json({ success: false, message: "Token expired." });
    }

    // Mark user as verified
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res
      .status(200)
      .json({ success: true, message: "Your email has been verified successfully 🎉" });
  } catch (error) {
    console.error("Verify Email Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};



// Resend Verification Email with cooldown
exports.resendVerificationEmail = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    if (user.isVerified) {
      return res.status(200).json({ success: true, message: "Email is already verified." });
    }

    // COOLDOWN: 2 minutes (120000 ms)
    const COOLDOWN = 2 * 60 * 1000;
    if (user.lastVerificationEmailSent && Date.now() - user.lastVerificationEmailSent < COOLDOWN) {
      const waitTime = Math.ceil((COOLDOWN - (Date.now() - user.lastVerificationEmailSent)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitTime} seconds before requesting another verification email.`,
      });
    }

    // If token expired or doesn't exist, regenerate
    if (!user.verificationToken || user.verificationTokenExpires < Date.now()) {
      const verificationToken = crypto.randomBytes(32).toString("hex");
      user.verificationToken = verificationToken;
      user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
    }

    // Update last sent timestamp
    user.lastVerificationEmailSent = Date.now();
    await user.save();

    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${user.verificationToken}&email=${email}`;
    console.log(verificationUrl)
    await sendEmail(
      email,
      "Verify Your Email",
      `<p>Hello ${user.name || "User"},</p>
       <p>Please verify your email by clicking the link below:</p>
       <a href="${verificationUrl}">Verify Email</a>
       <p>This link will expire in 24 hours.</p>`
    );

    return res.status(200).json({ success: true, message: "Verification email resent successfully." });
  } catch (error) {
    console.error(`Resend Email Error for ${email}:`, error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // make sure password is included
    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(400).json({ message: "Invalid email or password." });

    if (!user.isVerified) {
      return res.status(401).json({ message: "Please verify your email first." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password." });

    const token = generateToken(user._id);

    // remove password before sending response
    user.password = undefined;

    res.status(200).json({ message: "Login successful", token, login: true, user });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin Login
exports.adminLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(401).json({ message: "Invalid admin credentials." });

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid admin credentials." });

    const token = generateToken(user._id);

    // Remove password before sending
    user.password = undefined;

    res.status(200).json({
      message: "Admin login successful",
      token,
      user,
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get All Users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    console.error("GetAllUsers Error:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};







// Reset Password
exports.resetPassword = async (req, res) => {
  const { token, email } = req.query;
  const { password } = req.body;

  try {
    const user = await User.findOne({
      email,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // check expiry
    }).select("+password");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successful." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour expiry
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}&email=${email}`;

    await sendEmail(
      email,
      "Password Reset",
      `<p>Hello ${user.name || "User"},</p>
       <p>You requested to reset your password. Click the link below:</p>
       <a href="${resetUrl}">Reset Password</a>
       <p>This link will expire in 1 hour.</p>`
    );

    res.status(200).json({ message: "Password reset email sent successfully." });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
