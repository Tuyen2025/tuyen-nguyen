// ===============================
// 🟦 SERVER KHO ĐƯỜNG BÍCH TUYỀN
// ===============================

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// DEBUG xem biến môi trường MongoDB
console.log("DEBUG 👉 MONGO_URI =", process.env.MONGO_URI);

// MIDDLEWARE
app.use(cors());
app.use(express.json());

// ===============================
// 🟦 KẾT NỐI MONGODB
// ===============================
const uri = process.env.MONGO_URI;

if (!uri) {
    console.error("❌ ERROR: MONGO_URI không tồn tại trong Environment của Render!");
}

mongoose
    .connect(uri)
    .then(() => console.log("[DB] Connected MongoDB"))
    .catch((err) => console.error("[DB] Error:", err));

// ===============================
// 🟦 MODEL SẢN PHẨM
// ===============================
const productSchema = new mongoose.Schema({
    name: String,
    group: String,
    kgPerBao: Number,
});

const Product = mongoose.model("Product", productSchema);

// ===============================
// 🟦 DỮ LIỆU MẶC ĐỊNH
// ===============================
const defaultProducts = [
    { name: "Nhuyễn", group: "Đường cát", kgPerBao: 50 },
    { name: "Trung", group: "Đường cát", kgPerBao: 50 },
    { name: "Sóc Trăng To", group: "Đường cát", kgPerBao: 50 },
    { name: "Sóc Trăng Trung", group: "Đường cát", kgPerBao: 50 },
    { name: "Mía tím", group: "Đường cát", kgPerBao: 50 },
    { name: "Vàng", group: "Đường cát", kgPerBao: 50 },
    { name: "Phèn Xá", group: "Phèn", kgPerBao: 10 },
    { name: "Phèn BI Xanh Dương", group: "Phèn", kgPerBao: 10 },
    { name: "Phèn BI Xanh Lá", group: "Phèn", kgPerBao: 10 },
    { name: "Phèn Hạt Cam", group: "Phèn", kgPerBao: 10 },
    { name: "Phèn BI Túi", group: "Phèn", kgPerBao: 20 },
    { name: "Bi Đường", group: "Bi / phụ phẩm", kgPerBao: 10 },
    { name: "Bi Túi 500g", group: "Bi / phụ phẩm", kgPerBao: 10 },
    { name: "Bi Túi 1kg", group: "Bi / phụ phẩm", kgPerBao: 10 },
];

// ===============================
// 🟦 KHỞI TẠO DỮ LIỆU MẶC ĐỊNH (DEV)
// ===============================
async function initProductsIfNeeded() {
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
}

initProductsIfNeeded().catch(console.error);

// ===============================
// 🟦 API PRODUCTS
// ===============================

// Lấy danh sách sản phẩm
app.get("/products", async (req, res) => {
    const products = await Product.find({});
    res.json(products);
});

// Thêm 1 sản phẩm
app.post("/products", async (req, res) => {
    try {
        const { name, group, kgPerBao } = req.body;

        const newProduct = await Product.create({ name, group, kgPerBao });
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(500).json({ error: "Lỗi thêm sản phẩm" });
    }
});

// Thêm nhiều sản phẩm 1 lần (Batch Insert)
app.post("/products/batch", async (req, res) => {
    try {
        const list = req.body.products;

        if (!Array.isArray(list)) {
            return res.status(400).json({ error: "products phải là mảng" });
        }

        const inserted = await Product.insertMany(list);
        res.status(201).json(inserted);
    } catch (err) {
        res.status(500).json({ error: "Lỗi batch insert sản phẩm" });
    }
});

// ===============================
// 🟦 MODEL LỊCH SỬ NHẬP – XUẤT KHO
// ===============================
const inventorySchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    type: { type: String, enum: ["nhap", "xuat"], required: true },
    quantityBao: Number,
    quantityKg: Number,
    note: String,
    createdAt: { type: Date, default: Date.now },
});

const Inventory = mongoose.model("Inventory", inventorySchema);

// ===============================
// 🟦 API NHẬP KHO
// ===============================
app.post("/inventory/import", async (req, res) => {
    try {
        const { productId, quantityBao, note } = req.body;

        if (!productId || !quantityBao)
            return res.status(400).json({ error: "Thiếu productId hoặc quantityBao" });

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });

        const quantityKg = quantityBao * product.kgPerBao;

        const history = await Inventory.create({
            productId,
            type: "nhap",
            quantityBao,
            quantityKg,
            note,
        });

        res.json({ message: "Nhập kho thành công!", history });
    } catch (err) {
        console.error("Lỗi nhập kho:", err);
        res.status(500).json({ error: "Lỗi nhập kho" });
    }
});

// ===============================
// 🟦 API LỊCH SỬ KHO
// ===============================
app.get("/inventory/history", async (req, res) => {
    try {
        const data = await Inventory.find({})
            .populate("productId")
            .sort({ createdAt: -1 });

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: "Lỗi lấy lịch sử kho" });
    }
});

// ===============================
// 🟦 API TÍNH TỒN KHO
// ===============================
app.get("/inventory/stock", async (req, res) => {
    try {
        const products = await Product.find({});
        const history = await Inventory.find({});

        let result = [];

        for (let p of products) {
            const records = history.filter(r => r.productId?.toString() === p._id.toString());

            const totalNhap = records.filter(r => r.type === "nhap")
                                     .reduce((s, r) => s + r.quantityKg, 0);

            const totalXuat = records.filter(r => r.type === "xuat")
                                     .reduce((s, r) => s + r.quantityKg, 0);

            const tonKg = totalNhap - totalXuat;
            const tonBao = tonKg / p.kgPerBao;

            result.push({
                product: p.name,
                group: p.group,
                kgPerBao: p.kgPerBao,
                tonBao,
                tonKg,
            });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "Lỗi tính tồn kho" });
    }
});

// ===============================
// 🟦 START SERVER
// ===============================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});
