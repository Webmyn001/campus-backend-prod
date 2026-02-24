const express = require("express");
const {
    createProduct,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
} = require("../Controller/productController");

const authMiddleware = require("../Middleware/auth");
const adminMiddleware = require("../Middleware/admin");

const router = express.Router();

// Public Routes
router.get("/", getAllProducts);
router.get("/:id", getProductById);

// Admin Routes
router.post("/", authMiddleware, adminMiddleware, createProduct);
router.put("/:id", authMiddleware, adminMiddleware, updateProduct);
router.delete("/:id", authMiddleware, adminMiddleware, deleteProduct);

module.exports = router;
