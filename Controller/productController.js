const Product = require("../Models/Product");
const User = require("../Models/User");
const cloudinary = require("../config/cloudinary");

// Create Product
exports.createProduct = async (req, res) => {
    try {
        const {
            name, price, description, fullDescription,
            image, images, category, availability, type
        } = req.body;

        // Get current user (Admin) for prefilling
        const admin = await User.findById(req.user.id);

        let mainImage = {};
        if (image && typeof image === 'string') {
            // Accept both full data URLs and raw base64 strings
            let imageData = image;
            if (!imageData.startsWith('data:image')) {
                imageData = `data:image/png;base64,${imageData}`;
            }
            const upload = await cloudinary.uploader.upload(imageData, { folder: "products" });
            mainImage = { url: upload.secure_url, public_id: upload.public_id };
        }

        // Validate that a main image was successfully uploaded
        if (!mainImage.url || !mainImage.public_id) {
            return res.status(400).json({
                success: false,
                message: "A valid product image is required. Please upload an image.",
            });
        }

        let galleryImages = [];
        if (images && images.length > 0) {
            const promises = images.map(img => {
                if (typeof img === 'string') {
                    let imgData = img;
                    if (!imgData.startsWith('data:image')) {
                        imgData = `data:image/png;base64,${imgData}`;
                    }
                    return cloudinary.uploader.upload(imgData, { folder: "products" });
                }
                return null;
            }).filter(p => p !== null);

            const results = await Promise.all(promises);
            galleryImages = results.map(r => ({ url: r.secure_url, public_id: r.public_id }));
        }

        const productData = {
            name,
            price,
            description,
            fullDescription,
            mainImage,
            images: galleryImages,
            category,
            availability,
            type,
            sellerName: admin.name,
            sellerWhatsApp: admin.whatsapp,
            sellerImage: admin.profilePhoto?.url,
            school_name: admin.school_name,
            location_city: admin.location_city,
            // Course and Level are omitted for admins as requested
        };

        const product = await Product.create(productData);
        res.status(201).json({ success: true, product });
    } catch (error) {
        console.error("Create Product Error:", error);
        res.status(500).json({ success: false, message: error.message || "Error creating product" });
    }
};

// Get All Products (Internal: Filterable by type/category)
exports.getAllProducts = async (req, res) => {
    try {
        const { type, category } = req.query;
        let query = {};
        if (type) query.type = type;
        if (category) query.category = category;

        const products = await Product.find(query).sort({ postedAt: -1 });
        res.status(200).json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching products" });
    }
};

// Get Single Product
exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });
        res.status(200).json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching product" });
    }
};

// Update Product
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };
        const product = await Product.findById(id);

        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        // Handle single image update
        if (updates.image && typeof updates.image === 'string') {
            let imageData = updates.image;
            if (!imageData.startsWith('data:image')) {
                imageData = `data:image/png;base64,${imageData}`;
            }
            if (product.mainImage?.public_id) {
                await cloudinary.uploader.destroy(product.mainImage.public_id);
            }
            const upload = await cloudinary.uploader.upload(imageData, { folder: "products" });
            updates.mainImage = { url: upload.secure_url, public_id: upload.public_id };
            delete updates.image;
        }

        // Handle gallery update
        if (updates.images && Array.isArray(updates.images)) {
            // If the array contains Base64 strings, we upload them
            const newImagesPromises = updates.images.map(img => {
                if (typeof img === 'string') {
                    let imgData = img;
                    if (!imgData.startsWith('data:image')) {
                        imgData = `data:image/png;base64,${imgData}`;
                    }
                    return cloudinary.uploader.upload(imgData, { folder: "products" });
                }
                return null;
            }).filter(p => p !== null);

            if (newImagesPromises.length > 0) {
                // Simple logic: If any new image is provided, replace gallery. 
                // Cleanup old gallery if needed.
                if (product.images && product.images.length > 0) {
                    await Promise.all(product.images.map(img => cloudinary.uploader.destroy(img.public_id)));
                }
                const results = await Promise.all(newImagesPromises);
                updates.images = results.map(r => ({ url: r.secure_url, public_id: r.public_id }));
            }
        }

        const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, product: updatedProduct });
    } catch (error) {
        console.error("Update Product Error:", error);
        res.status(500).json({ success: false, message: "Error updating product" });
    }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        // Cleanup images from Cloudinary
        if (product.mainImage?.public_id) {
            await cloudinary.uploader.destroy(product.mainImage.public_id);
        }
        if (product.images && product.images.length > 0) {
            await Promise.all(product.images.map(img => cloudinary.uploader.destroy(img.public_id)));
        }

        await Product.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Product deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting product" });
    }
};
