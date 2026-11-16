const Product = require("../Models/Product");
const User = require("../Models/User");
const cloudinary = require("../config/cloudinary");
const { isObjectId, escapeRegex } = require("../utils/security");
const { text } = require("../utils/listings");
const { normalizeImagePayload } = require("../utils/images");

const MAX_GALLERY = 8;
const TYPES = ["admin-gadget", "admin-food", "community"];
const AVAILABILITY = ["In Stock", "Low Stock", "Out of Stock"];

async function uploadImage(value, folder = "products") {
  const normalized = normalizeImagePayload(value);
  const upload = await cloudinary.uploader.upload(normalized, { folder });
  return { url: upload.secure_url, public_id: upload.public_id };
}

async function uploadGallery(images) {
  if (!Array.isArray(images)) throw new Error("Images must be an array");
  if (images.length > MAX_GALLERY) throw new Error(`At most ${MAX_GALLERY} gallery images are allowed`);
  const output = [];
  for (const entry of images) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof entry.url === "string" &&
      typeof entry.public_id === "string"
    ) {
      output.push({ url: entry.url, public_id: entry.public_id });
    } else {
      output.push(await uploadImage(entry));
    }
  }
  return output;
}

function sanitizeOktoberFest(raw, { prefix = "" } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const fest = {};
  if (raw.enabled !== undefined) {
    fest[`${prefix}enabled`] = raw.enabled === true || raw.enabled === "true";
  }
  for (const field of ["originalPrice", "salePrice", "stock"]) {
    if (raw[field] !== undefined) {
      const value = Number(raw[field]);
      if (Number.isFinite(value) && value >= 0) fest[`${prefix}${field}`] = value;
    }
  }
  for (const field of ["startDate", "endDate"]) {
    if (raw[field] !== undefined) {
      const date = new Date(raw[field]);
      if (!Number.isNaN(date.getTime())) fest[`${prefix}${field}`] = date;
    }
  }
  return Object.keys(fest).length ? fest : undefined;
}

function buildProductFields(body, { forCreate = false } = {}) {
  const updates = {};
  const name = text(body.name, 120);
  if (name) updates.name = name;

  if (body.price !== undefined) {
    const price = Number(body.price);
    if (Number.isFinite(price) && price >= 0) updates.price = price;
  }

  const description = text(body.description, 600);
  if (description) updates.description = description;
  const fullDescription = text(body.fullDescription, 10000);
  if (fullDescription) updates.fullDescription = fullDescription;

  const category = text(body.category, 80);
  if (category) updates.category = category;

  if (AVAILABILITY.includes(body.availability)) updates.availability = body.availability;
  if (TYPES.includes(body.type)) updates.type = body.type;

  if (body.soldOut !== undefined) updates.soldOut = body.soldOut === true || body.soldOut === "true";
  if (body.isManaged !== undefined) updates.isManaged = body.isManaged === true || body.isManaged === "true";

  const ownerName = text(body.ownerName, 120);
  if (ownerName) updates.ownerName = ownerName;
  const schoolName = text(body.school_name, 120);
  if (schoolName) updates.school_name = schoolName;
  const locationCity = text(body.location_city, 120);
  if (locationCity) updates.location_city = locationCity;

  if (body.maxDeliveryDays !== undefined) {
    if (body.maxDeliveryDays === null || body.maxDeliveryDays === "") {
      updates.maxDeliveryDays = null;
    } else {
      const days = Number(body.maxDeliveryDays);
      if (Number.isInteger(days) && days >= 1 && days <= 365) updates.maxDeliveryDays = days;
    }
  }

  const fest = sanitizeOktoberFest(body.oktoberFest, {
    prefix: forCreate ? "" : "oktoberFest.",
  });
  if (fest) {
    if (forCreate) updates.oktoberFest = fest;
    else Object.assign(updates, fest);
  }

  return updates;
}

// Create Product
exports.createProduct = async (req, res) => {
  try {
    const admin = await User.findById(req.user.id);
    if (!admin) return res.status(401).json({ success: false, message: "Account not found" });

    const fields = buildProductFields(req.body, { forCreate: true });
    if (!fields.name || fields.price === undefined || !fields.description ||
        !fields.fullDescription || !fields.category || !fields.type) {
      return res.status(400).json({
        success: false,
        message: "Name, price, descriptions, category and type are required.",
      });
    }

    if (!req.body.image) {
      return res.status(400).json({ success: false, message: "A valid product image is required." });
    }

    let mainImage;
    try {
      mainImage = await uploadImage(req.body.image);
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    let galleryImages = [];
    if (req.body.images !== undefined) {
      try {
        galleryImages = await uploadGallery(req.body.images);
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
    }

    const product = await Product.create({
      ...fields,
      mainImage,
      images: galleryImages,
      sellerName: admin.name,
      sellerWhatsApp: admin.whatsapp,
      sellerImage: admin.profilePhoto?.url,
      sellerId: admin._id,
      school_name: fields.school_name || admin.school_name,
      location_city: fields.location_city || admin.location_city,
      isUserVerified: !!admin.isUserVerified,
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Invalid product data." });
    }
    console.error("Create Product Error:", error.message);
    res.status(500).json({ success: false, message: "Error creating product" });
  }
};

// Get All Products (Filterable by type/category)
exports.getAllProducts = async (req, res) => {
  try {
    const query = {};
    if (typeof req.query.type === "string" && TYPES.includes(req.query.type)) {
      query.type = req.query.type;
    }
    if (typeof req.query.category === "string" && req.query.category.length <= 80) {
      query.category = req.query.category;
    }

    const products = await Product.find(query).sort({ postedAt: -1 });
    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("Get Products Error:", error.message);
    res.status(500).json({ success: false, message: "Error fetching products" });
  }
};

// Get Single Product
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    let product = null;

    if (isObjectId(id)) {
      product = await Product.findById(id);
    } else if (/^[a-fA-F0-9]{10}$/.test(id)) {
      product = await Product.findOne({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: escapeRegex(id) + "$",
            options: "i",
          },
        },
      });
    }

    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, product });
  } catch (error) {
    console.error("Get Product Error:", error.message);
    res.status(500).json({ success: false, message: "Error fetching product" });
  }
};

// Update Product (admin only)
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const updates = buildProductFields(req.body);

    let newMainImage = null;
    if (req.body.image !== undefined && req.body.image !== null && req.body.image !== "") {
      try {
        newMainImage = await uploadImage(req.body.image);
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      updates.mainImage = newMainImage;
    }

    let newGallery = null;
    if (req.body.images !== undefined) {
      try {
        newGallery = await uploadGallery(req.body.images);
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }
      updates.images = newGallery;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No permitted fields to update." });
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (newMainImage && product.mainImage?.public_id &&
        product.mainImage.public_id !== newMainImage.public_id) {
      await cloudinary.uploader.destroy(product.mainImage.public_id).catch(() => null);
    }
    if (newGallery) {
      const kept = new Set(newGallery.map((img) => img.public_id));
      const removed = (product.images || []).filter((img) => !kept.has(img.public_id));
      await Promise.all(removed.map((img) => cloudinary.uploader.destroy(img.public_id).catch(() => null)));
    }

    res.status(200).json({ success: true, product: updatedProduct });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Invalid product data." });
    }
    console.error("Update Product Error:", error.message);
    res.status(500).json({ success: false, message: "Error updating product" });
  }
};

// Delete Product (admin only)
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid product ID." });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    if (product.mainImage?.public_id) {
      await cloudinary.uploader.destroy(product.mainImage.public_id).catch(() => null);
    }
    if (product.images?.length) {
      await Promise.all(product.images.map((img) => cloudinary.uploader.destroy(img.public_id).catch(() => null)));
    }

    await product.deleteOne();

    const Analytics = require("../Models/Analytics");
    await Analytics.deleteMany({ productId: id }).catch(() => {});

    res.status(200).json({ success: true, message: "Product deleted" });
  } catch (error) {
    console.error("Delete Product Error:", error.message);
    res.status(500).json({ success: false, message: "Error deleting product" });
  }
};
