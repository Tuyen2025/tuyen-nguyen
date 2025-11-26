//------------------------------------------------------------
// 🟦 SERVER KHO ĐƯỜNG BÍCH TUYỀN – FULL VERSION (OCR 3.0)
//------------------------------------------------------------

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// OCR + Upload + Fuzzy
const multer = require("multer");
const Tesseract = require("tesseract.js");
const levenshtein = require("fast-levenshtein");

// Upload thư mục tạm
const upload = multer({ dest: "uploads/" });

const app = express();

// Debug biến môi trường
console.log("DEBUG 👉 MONGO_URI =", process.env.MONGO_URI);

app.use(cors());
app.use(express.json());

//------------------------------------------------------------
// 🟦 KẾT NỐI MONGODB
//------------------------------------------------------------
const uri = process.env.MONGO_URI;

if (!uri) console.error("❌ ERROR: MONGO_URI chưa được khai báo!");

mongoose
  .connect(uri)
  .then(() => console.log("[DB] Connected MongoDB"))
  .catch((err) => console.error("[DB] Error:", err));


//------------------------------------------------------------
// 🟦 MODEL: SẢN PHẨM
//------------------------------------------------------------
const productSchema = new mongoose.Schema({
  name: String,
  group: String,
  kgPerBao: Number,
});

const Product = mongoose.model("Product", productSchema);

//------------------------------------------------------------
// 🟦 MODEL: LỊCH SỬ NHẬP – XUẤT
//------------------------------------------------------------
const inventorySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  type: { type: String, enum: ["nhap", "xuat"], required: true },
  quantityBao: Number,
  quantityKg: Number,
  note: String,
  createdAt: { type: Date, default: Date.now }
});

const Inventory = mongoose.model("Inventory", inventorySchema);


//------------------------------------------------------------
// 🟦 DỮ LIỆU MẶC ĐỊNH
//------------------------------------------------------------
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

//------------------------------------------------------------
// 🟦 KHỞI TẠO DỮ LIỆU (không chạy khi production)
//------------------------------------------------------------
async function initProductsIfNeeded() {
  if (process.env.ENV === "production") {
    console.log("[SEED] Bỏ qua seed (Render mode)");
    return;
  }

  const count = await Product.countDocuments();
  if (count === 0) {
    await Product.insertMany(defaultProducts);
    console.log("[INIT] Inserted default products");
  } else {
    console.log("[INIT] Products exist → Skip");
  }
}

initProductsIfNeeded().catch(console.error);


//------------------------------------------------------------
// 🟦 API PRODUCTS
//------------------------------------------------------------

// Lấy danh sách sản phẩm
app.get("/products", async (req, res) => {
  const products = await Product.find({});
  res.json(products);
});

// Thêm 1 sản phẩm
app.post("/products", async (req, res) => {
  try {
    const newProduct = await Product.create(req.body);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ error: "Lỗi thêm sản phẩm" });
  }
});

// Thêm nhiều sản phẩm
app.post("/products/batch", async (req, res) => {
  try {
    const { products } = req.body;
    const inserted = await Product.insertMany(products);
    res.status(201).json(inserted);
  } catch (err) {
    res.status(500).json({ error: "Lỗi batch insert" });
  }
});


//------------------------------------------------------------
// 🟦 API NHẬP KHO
//------------------------------------------------------------
app.post("/inventory/import", async (req, res) => {
  try {
    const { productId, quantityBao, note } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: "Sản phẩm không tồn tại" });

    const quantityKg = quantityBao * product.kgPerBao;

    const history = await Inventory.create({
      productId,
      type: "nhap",
      quantityBao,
      quantityKg,
      note
    });

    res.json({ message: "Nhập kho thành công", history });

  } catch (err) {
    res.status(500).json({ error: "Lỗi nhập kho" });
  }
});


//------------------------------------------------------------
// 🟦 HELPERS OCR 3.0
//------------------------------------------------------------
function normalize(str) {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findBestMatchName(text, products) {
  let best = null;
  let bestScore = Infinity;

  const target = normalize(text);

  for (let p of products) {
    const nameNorm = normalize(p.name);
    const dist = levenshtein.get(target, nameNorm);

    if (dist < bestScore) {
      bestScore = dist;
      best = p;
    }
  }

  return bestScore <= 4 ? best : null;
}


//------------------------------------------------------------
// 🟦 OCR 3.0 — BẢN NHÁP (KHÔNG GHI KHO)
//------------------------------------------------------------
app.post("/ocr/preview-export", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Chưa upload ảnh" });

    const ocr = await Tesseract.recognize(req.file.path, "vie+eng");
    const rawText = ocr.data.text || "";

    const lines = rawText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    const products = await Product.find({});
    const preview = [];
    const errors = [];

    for (let line of lines) {
      const qtyToken = line.match(/\b\d{1,3}\b/);

      if (!qtyToken) {
        errors.push({ line, error: "Không tìm thấy số lượng" });
        continue;
      }

      const quantityBao = Number(qtyToken[0]);
      const namePart = line.replace(qtyToken[0], "").trim();

      const matched = findBestMatchName(namePart, products);
      if (!matched) {
        errors.push({ line, error: "Không map được sản phẩm" });
        continue;
      }

      preview.push({
        line,
        productId: matched._id,
        productName: matched.name,
        kgPerBao: matched.kgPerBao,
        quantityBao,
        quantityKg: quantityBao * matched.kgPerBao
      });
    }

    res.json({
      message: "OCR 3.0 Preview",
      rawText,
      preview,
      errors
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi OCR 3.0" });
  }
});


//------------------------------------------------------------
// 🟦 GHI XÁC NHẬN XUẤT KHO (SAU PREVIEW)
//------------------------------------------------------------
app.post("/inventory/confirm-export", async (req, res) => {
  try {
    const { items } = req.body;
    const histories = [];

    for (let item of items) {
      const history = await Inventory.create({
        productId: item.productId,
        type: "xuat",
        quantityBao: item.quantityBao,
        quantityKg: item.quantityKg,
        note: item.note || "Xuất kho từ OCR 3.0"
      });

      histories.push(history);
    }

    res.json({
      message: "Đã ghi xuất kho",
      count: histories.length,
      histories
    });

  } catch (err) {
    res.status(500).json({ error: "Lỗi xác nhận xuất kho" });
  }
});


//------------------------------------------------------------
// 🟦 LỊCH SỬ KHO
//------------------------------------------------------------
app.get("/inventory/history", async (req, res) => {
  const data = await Inventory.find({}).populate("productId").sort({ createdAt: -1 });
  res.json(data);
});


//------------------------------------------------------------
// 🟦 API TỒN KHO
//------------------------------------------------------------
app.get("/inventory/stock", async (req, res) => {
  const products = await Product.find({});
  const history = await Inventory.find({});

  const result = [];

  for (let p of products) {
    const rec = history.filter(h => h.productId?.toString() === p._id.toString());

    const totalNhap = rec.filter(h => h.type === "nhap").reduce((s, r) => s + r.quantityKg, 0);
    const totalXuat = rec.filter(h => h.type === "xuat").reduce((s, r) => s + r.quantityKg, 0);

    const tonKg = totalNhap - totalXuat;

    result.push({
      product: p.name,
      group: p.group,
      tonBao: tonKg / p.kgPerBao,
      tonKg
    });
  }

  res.json(result);
});


//------------------------------------------------------------
// 🟦 START SERVER
//------------------------------------------------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
