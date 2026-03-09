import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import * as XLSX from "xlsx";

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // ==========================================
  // API Routes
  // ==========================================
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Backend is running!" });
  });

  app.post("/api/upload-rates", upload.single("file"), (req, res): any => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        return res.status(400).json({ error: "The Excel file seems to be empty or has no data in the first sheet." });
      }

      const parsedRates: any[] = [];

      const cleanNumber = (val: any): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const cleaned = val.replace(/[$,\s]/g, '');
          return Number(cleaned);
        }
        return NaN;
      };

      jsonData.forEach((row, index) => {
        let segmentName = "";
        const rowKeys = Object.keys(row);
        
        const segmentPriorityKeys = ["TOURS", "SEGMENT", "SERVICE", "DESCRIPTION", "SR. NO."];
        
        for (const pKey of segmentPriorityKeys) {
          const foundKey = rowKeys.find(k => k.trim().toUpperCase() === pKey);
          if (foundKey && row[foundKey]) {
            segmentName = String(row[foundKey]).trim();
            break;
          }
        }

        if (!segmentName || segmentName === "") return;

        rowKeys.forEach(key => {
          const trimmedKey = key.trim();
          const paxMatch = trimmedKey.match(/^(\d+)\s*PAX$/i) || trimmedKey.match(/^PAX\s*(\d+)$/i);
          
          if (paxMatch) {
            const paxCount = parseInt(paxMatch[1]);
            const rateValue = cleanNumber(row[key]);

            if (!isNaN(rateValue) && rateValue > 0) {
              parsedRates.push({
                segment: segmentName,
                paxRange: `${paxCount}`,
                minPax: paxCount,
                maxPax: paxCount,
                rate: rateValue,
                currency: row.Currency || row.currency || row.CURRENCY || "USD"
              });
            }
          }
        });

        const rateKey = rowKeys.find(k => k.trim().toUpperCase() === "RATE");
        const rate = rateKey ? cleanNumber(row[rateKey]) : NaN;
        
        if (!isNaN(rate) && rate > 0) {
          const minPaxKey = rowKeys.find(k => k.trim().toUpperCase() === "MINPAX" || k.trim().toUpperCase() === "MIN PAX");
          const maxPaxKey = rowKeys.find(k => k.trim().toUpperCase() === "MAXPAX" || k.trim().toUpperCase() === "MAX PAX");
          const paxKey = rowKeys.find(k => k.trim().toUpperCase() === "PAX");
          
          let minPax = minPaxKey ? cleanNumber(row[minPaxKey]) : NaN;
          let maxPax = maxPaxKey ? cleanNumber(row[maxPaxKey]) : NaN;
          const exactPax = paxKey ? cleanNumber(row[paxKey]) : NaN;
          
          if (!isNaN(exactPax) && isNaN(minPax)) {
            minPax = exactPax;
            maxPax = exactPax;
          }

          if (!isNaN(minPax) && !isNaN(maxPax)) {
            parsedRates.push({
              segment: segmentName,
              paxRange: minPax === maxPax ? `${minPax}` : `${minPax}-${maxPax}`,
              minPax,
              maxPax,
              rate,
              currency: row.Currency || row.currency || row.CURRENCY || "USD"
            });
          }
        }
      });

      if (parsedRates.length === 0) {
        return res.status(400).json({ error: "No valid rates found. Please ensure your columns are named '1 PAX', '2 PAX', etc., or 'Rate'." });
      }

      res.json({ success: true, rates: parsedRates });
    } catch (err: any) {
      console.error("Excel Upload Error:", err);
      res.status(500).json({ error: err.message || "Failed to parse Excel file." });
    }
  });

  // Example API route for you to expand on
  app.post("/api/example", (req, res) => {
    const data = req.body;
    res.json({ success: true, received: data });
  });

  // ==========================================
  // Vite Middleware for Development
  // ==========================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from the dist directory
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
