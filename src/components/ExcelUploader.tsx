import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { GroundServiceRate } from '../types';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface ExcelUploaderProps {
  onRatesLoaded: (rates: GroundServiceRate[]) => Promise<void> | void;
}

export const ExcelUploader: React.FC<ExcelUploaderProps> = ({ onRatesLoaded }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          throw new Error("The Excel file seems to be empty or has no data in the first sheet.");
        }

        const parsedRates: GroundServiceRate[] = [];

        const cleanNumber = (val: any): number => {
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            // Remove currency symbols, commas, and spaces
            const cleaned = val.replace(/[$,\s]/g, '');
            return Number(cleaned);
          }
          return NaN;
        };

        jsonData.forEach((row, index) => {
          // Find segment name by looking at all keys
          let segmentName = "";
          const rowKeys = Object.keys(row);
          
          // Priority keys for segment name
          const segmentPriorityKeys = ["TOURS", "SEGMENT", "SERVICE", "DESCRIPTION", "SR. NO."];
          
          for (const pKey of segmentPriorityKeys) {
            const foundKey = rowKeys.find(k => k.trim().toUpperCase() === pKey);
            if (foundKey && row[foundKey]) {
              segmentName = String(row[foundKey]).trim();
              break;
            }
          }

          if (!segmentName || segmentName === "") return;

          // Look for columns like "1 PAX", "2 PAX", etc.
          rowKeys.forEach(key => {
            const trimmedKey = key.trim();
            // Match "1 PAX", "1PAX", "PAX 1", etc.
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

          // Also support the old format (MinPax/MaxPax/Rate)
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

        console.log("Parsed Rates:", parsedRates);

        if (parsedRates.length === 0) {
          throw new Error("No valid rates found. Please ensure your columns are named '1 PAX', '2 PAX', etc., or 'Rate'.");
        }

        await onRatesLoaded(parsedRates);
        setSuccess(true);
      } catch (err: any) {
        console.error("Excel Upload Error:", err);
        setError(err.message || "Failed to parse Excel file.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setError("Failed to read file.");
      setLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const downloadSample = () => {
    const sampleData = [
      { 
        "SEGMENT": "Airport Transfer", 
        "1 PAX": 50, 
        "2 PAX": 30, 
        "3 PAX": 25, 
        "4 PAX": 20,
        "Currency": "USD" 
      },
      { 
        "SEGMENT": "Full Day Tour", 
        "1 PAX": 150, 
        "2 PAX": 100, 
        "3 PAX": 80, 
        "4 PAX": 70,
        "Currency": "USD" 
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rates");
    XLSX.writeFile(wb, "sample_rates.xlsx");
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-black/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Upload Service Rates</h2>
        </div>
        <button 
          onClick={downloadSample}
          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline"
        >
          Download Sample
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Upload an Excel file with columns: <code className="bg-gray-100 px-1 rounded">Segment</code>, <code className="bg-gray-100 px-1 rounded">MinPax</code>, <code className="bg-gray-100 px-1 rounded">MaxPax</code>, <code className="bg-gray-100 px-1 rounded">Rate</code>, <code className="bg-gray-100 px-1 rounded">Currency</code>.
      </p>

      <div className="relative">
        <input
          type="file"
          ref={fileInputRef}
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        <div 
          onClick={() => !loading && fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
            ${loading ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-emerald-400'}
            ${success ? 'border-emerald-500 bg-emerald-50/50' : ''}
            ${error ? 'border-red-500 bg-red-50/50' : ''}
          `}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-600">Processing file...</p>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
              <p className="text-sm font-medium text-emerald-700">Rates loaded successfully!</p>
              <p className="text-xs text-emerald-600">Click to upload another.</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-sm font-medium text-red-700">{error}</p>
              <p className="text-xs text-red-600">Click to try again.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">Click to upload Excel</p>
              <p className="text-xs text-gray-500">.xlsx, .xls or .csv</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
