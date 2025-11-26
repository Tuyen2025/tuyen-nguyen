require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
console.log("DEBUG 👉 MONGO_URI =", process.env.MONGO_URI); 
// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json());

// ====== KẾT NỐI MONGODB ======
const uri = process.env.MONGODB_URI;
mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("[DB] Connected MongoDB"))
  .catch((err) => console.error("[DB] Error:", err));

// ====== CẤU HÌNH SẢN PHẨM (GIỐNG FRONTEND) ======
const PRODUCTS = [
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
  { name: "Bi Túi 1kg", group: "Bi / phụ phẩm", kgPerBao: 10 }
];

// ====== MONGOOSE SCHEMA ======
// 1) Lưu sản phẩm (để sau này chỉnh sửa từ DB cũng được)
const productSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  group: String,
  kgPerBao: Number
});
const Product = mongoose.model("Product", productSchema);

// 2) Lưu tồn theo ngày + sản phẩm
// dateKey dạng "2025-11-26"
const inventorySchema = new mongoose.Schema(
  {
    dateKey: String,
    productName: String,

    tonBao: { type: Number, default: 0 },
    nhapBao: { type: Number, default: 0 },
    xuatBao: { type: Number, default: 0 },
    thucTeBao: { type: Number, default: 0 }
  },
  { timestamps: true }
);

inventorySchema.index({ dateKey: 1, productName: 1 }, { unique: true });

const Inventory = mongoose.model("Inventory", inventorySchema);

// 3) Lưu snapshot ngày (để xem lịch sử)
const snapshotSchema = new mongoose.Schema(
  {
    dateKey: { type: String, unique: true },
    items: [
      {
        productName: String,
        cuoiBao: Number
      }
    ]
  },
  { timestamps: true }
);

const Snapshot = mongoose.model("Snapshot", snapshotSchema);

// ====== HÀM HỖ TRỢ ======
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

// Khởi tạo dữ liệu sản phẩm lần đầu (nếu DB trống)
async function initProductsIfNeeded() {
  const count = await Product.countDocuments();
  if (count === 0) {
    await Product.insertMany(PRODUCTS);
    console.log("[INIT] Inserted default products");
  } else {
    console.log("[INIT] Products already exist");
  }
}
initProductsIfNeeded().catch(console.error);

// ====== API CƠ BẢN ======

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date() });
});

// Lấy danh sách sản phẩm
app.get("/api/products", async (req, res) => {
  const list = await Product.find().sort({ name: 1 }).lean();
  res.json(list);
});

// Lấy tồn kho theo ngày (dateKey = YYYY-MM-DD, nếu không gửi → lấy hôm nay)
app.get("/api/inventory", async (req, res) => {
  let { date } = req.query;
  if (!date) date = todayKey();

  // Lấy tất cả bản ghi tồn cho ngày đó
  const records = await Inventory.find({ dateKey: date }).lean();

  // Map theo sản phẩm, nếu chưa có trong DB thì trả 0
  const byProduct = {};
  records.forEach((r) => {
    byProduct[r.productName] = r;
  });

  const products = await Product.find().lean();

  const result = products.map((p) => {
    const r = byProduct[p.name] || {};
    const tonBao = r.tonBao || 0;
    const nhapBao = r.nhapBao || 0;
    const xuatBao = r.xuatBao || 0;
    const thucTeBao = r.thucTeBao || 0;
    const cuoiBao = tonBao + nhapBao - xuatBao;
    const cuoiKg = cuoiBao * (p.kgPerBao || 0);
    const lechBao = thucTeBao ? thucTeBao - cuoiBao : 0;

    return {
      productName: p.name,
      group: p.group,
      kgPerBao: p.kgPerBao,
      dateKey: date,
      tonBao,
      nhapBao,
      xuatBao,
      thucTeBao,
      cuoiBao,
      cuoiKg,
      lechBao
    };
  });

  res.json(result);
});

// Cập nhật 1 field cho 1 sản phẩm / ngày
// Body: { dateKey, productName, field, value }
app.post("/api/inventory/update", async (req, res) => {
  try {
    let { dateKey, productName, field, value } = req.body;
    if (!dateKey) dateKey = todayKey();
    if (!productName || !field) {
      return res.status(400).json({ error: "Missing productName or field" });
    }

    const numericFields = ["tonBao", "nhapBao", "xuatBao", "thucTeBao"];
    if (!numericFields.includes(field)) {
      return res.status(400).json({ error: "Invalid field" });
    }

    const numVal = Number(value) || 0;

    const record = await Inventory.findOneAndUpdate(
      { dateKey, productName },
      { $set: { [field]: numVal } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, record });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// API nhận nhiều dòng từ AI OCR (bulk)
// Body: { dateKey, type: "nhap" | "xuat", items: [{productName, qtyBao}, ...] }
app.post("/api/inventory/bulk-apply", async (req, res) => {
  try {
    let { dateKey, type, items } = req.body;
    if (!dateKey) dateKey = todayKey();
    if (!Array.isArray(items)) items = [];

    const field = type === "nhap" ? "nhapBao" : "xuatBao";
    const updates = [];

    for (const it of items) {
      const name = it.productName;
      const qty = Number(it.qtyBao) || 0;
      if (!name || qty === 0) continue;

      const record = await Inventory.findOne({ dateKey, productName: name });
      if (record) {
        record[field] = (record[field] || 0) + qty;
        await record.save();
        updates.push({ productName: name, newValue: record[field] });
      } else {
        const doc = await Inventory.create({
          dateKey,
          productName: name,
          [field]: qty
        });
        updates.push({ productName: name, newValue: doc[field] });
      }
    }

    res.json({ ok: true, updates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Lưu snapshot tồn cuối ngày (dùng cho lịch sử / sparkline)
app.post("/api/inventory/snapshot", async (req, res) => {
  try {
    let { dateKey } = req.body;
    if (!dateKey) dateKey = todayKey();

    const inv = await Inventory.find({ dateKey }).lean();
    const byProduct = {};
    inv.forEach((r) => {
      byProduct[r.productName] = r;
    });

    const products = await Product.find().lean();
    const items = products.map((p) => {
      const r = byProduct[p.name] || {};
      const tonBao = r.tonBao || 0;
      const nhapBao = r.nhapBao || 0;
      const xuatBao = r.xuatBao || 0;
      const cuoiBao = tonBao + nhapBao - xuatBao;
      return {
        productName: p.name,
        cuoiBao
      };
    });

    const doc = await Snapshot.findOneAndUpdate(
      { dateKey },
      { $set: { items } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, snapshot: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Lấy danh sách ngày có snapshot
app.get("/api/history/dates", async (req, res) => {
  const list = await Snapshot.find({}, { dateKey: 1, _id: 0 })
    .sort({ dateKey: 1 })
    .lean();
  res.json(list.map((d) => d.dateKey));
});

// Lấy snapshot 1 ngày
app.get("/api/history/:dateKey", async (req, res) => {
  const { dateKey } = req.params;
  const doc = await Snapshot.findOne({ dateKey }).lean();
  if (!doc) return res.json({ dateKey, items: [] });
  res.json(doc);
});

// ====== START SERVER ======
const PORT = process.env.PORT || 10000;
app.listen(PORT)






