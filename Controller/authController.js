const User = require("../Models/User");
const jwt = require("jsonwebtoken");

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Signup
exports.signup = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const user = await User.create({ email, password, name });
    const token = generateToken(user._id);

    res.status(201).json({ message: "Signup successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const token = generateToken(user._id);
    res.status(200).json({ message: "Login successful", token, Login: true, user });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};


// Get all Users
exports.getAllUsers = async (req, res) => {
    try {
      const Users = await User.find()
      res.status(200).json(Users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch listings", error });
    }
  };


  // Update User (New Controller)
exports.updateUser = async (req, res) => {
    const { id } = req.params; // Get user ID from request params
    const updates = req.body; // Get fields to update from request body
  
    try {
      // Find user by ID and update with new data
      const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found." });
      }
  
      res.status(200).json({ message: "User updated successfully", user: updatedUser });
    } catch (error) {
      res.status(500).json({ message: "Failed to update user", error });
    }
  };


  // Get Individual User by ID
exports.getUserById = async (req, res) => {
    const { id } = req.params; // Extract the user ID from the request parameters
  
    try {
      // Find the user by ID
      const user = await User.findById(id);
  
      // Check if user exists
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
  
      // Respond with the user data
      res.status(200).json(user);
    } catch (error) {
      // Handle errors (e.g., invalid ID format or database errors)
      res.status(500).json({ message: "Failed to fetch user", error });
    }
  };