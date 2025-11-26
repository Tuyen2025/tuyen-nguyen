require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ==========================
// DEBUG CHECK MONGO URI
// ==========================
console.log("DEBUG 👉 MONGO_URI =", process.env.MONGO_URI);

// ==========================
// KẾT NỐI MONGODB
// ==========================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("[DB] Connected MongoDB"))
  .catch((err) => console.error("[DB] Error:", err));


// ==========================
// MODEL SẢN PHẨM
// ==========================
const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  qty: Number,
});

const Product = mongoose.model("Product", productSchema);


// ==========================
// DỮ LIỆU MẶC ĐỊNH (LOCAL DEV)
// ==========================
const defaultProducts = [
  { name: "Đường Cát 50KG", price: 0, qty: 0 },
  { name: "Đường Cây 12KG", price: 0, qty: 0 },
  { name: "Đường Bi Xanh Dương", price: 0, qty: 0 },
  { name: "Đường Bi Xanh Lá", price: 0, qty: 0 },
  { name: "Đường Bi Cam", price: 0, qty: 0 },
  { name: "Đường Bi Túi 20KG", price: 0, qty: 0 }
];


// ==========================
// SEED DATABASE — CHỈ CHẠY KHI LOCAL
// ==========================
async function seedProducts() {
  try {
    if (process.env.ENV === "production") {
      console.log("[SEED] Bỏ qua seed vì đang chạy Render");
      return;
    }

    const count = await Product.countDocuments();
    if (count === 0) {
      await Product.insertMany(defaultProducts);
      console.log("[INIT] Inserted default products");
    } else {
      console.log("[INIT] Database đã có sản phẩm → không seed");
    }

  } catch (err) {
    console.error("[SEED ERROR]", err);
  }
}
seedProducts();


// ==========================
// API ROUTES
// ==========================

// Lấy danh sách sản phẩm
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Error fetching products", error: err });
  }
});
// ====== API: THÊM NHIỀU SẢN PHẨM ======
app.post("/products/batch", async (req, res) => {
  try {
    const products = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "Dữ liệu phải là mảng sản phẩm!" });
    }

    const inserted = await Product.insertMany(products);

    res.status(201).json({
      message: "Thêm nhiều sản phẩm thành công!",
      count: inserted.length,
      data: inserted
    });

  } catch (err) {
    console.error("Batch insert error:", err);
    res.status(500).json({ error: "Lỗi server khi thêm nhiều sản phẩm" });
  }
});

// ====== API: THÊM SẢN PHẨM ======
app.post("/products", async (req, res) => {
    try {
        const { name, group, kgPerBao } = req.body;

        // KIỂM TRA DỮ LIỆU
        if (!name || !group || !kgPerBao) {
            return res.status(400).json({ error: "Thiếu dữ liệu bắt buộc!" });
        }

        const newProduct = await Product.create({
            name,
            group,
            kgPerBao
        });

        res.status(201).json({
            message: "Thêm sản phẩm thành công!",
            product: newProduct
        });
    } catch (err) {
        console.error("Lỗi tạo sản phẩm:", err);
        res.status(500).json({ error: "Lỗi server" });
    }
});

// Tạo sản phẩm
app.post("/products", async (req, res) => {
  try {
    const p = new Product(req.body);
    await p.save();
    res.json({ message: "Created", product: p });
  } catch (err) {
    res.status(500).json({ message: "Error creating product", error: err });
  }
});

// Cập nhật sản phẩm
app.put("/products/:id", async (req, res) => {
  try {
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ message: "Updated", product: updated });
  } catch (err) {
    res.status(500).json({ message: "Error updating product", error: err });
  }
});

// Xóa sản phẩm
app.delete("/products/:id", async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting product", error: err });
  }
});


// ==========================
// CHẠY SERVER
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});


