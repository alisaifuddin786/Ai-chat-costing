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

  const parseRatesLocally = async (file: File): Promise<GroundServiceRate[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error('The Excel file does not contain any sheets.');
    }

    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    if (jsonData.length === 0) {
      throw new Error('The Excel file seems to be empty or has no data in the first sheet.');
    }

    const cleanNumber = (val: unknown): number => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[$,\s]/g, '');
        return Number(cleaned);
      }
      return Number.NaN;
    };

    const parsedRates: GroundServiceRate[] = [];

    jsonData.forEach((row) => {
      const rowKeys = Object.keys(row);
      const segmentPriorityKeys = ['TOURS', 'SEGMENT', 'SERVICE', 'DESCRIPTION', 'SR. NO.'];

      let segmentName = '';
      for (const priorityKey of segmentPriorityKeys) {
        const foundKey = rowKeys.find((key) => key.trim().toUpperCase() === priorityKey);
        if (foundKey && row[foundKey]) {
          segmentName = String(row[foundKey]).trim();
          break;
        }
      }

      if (!segmentName) return;

      rowKeys.forEach((key) => {
        const trimmedKey = key.trim();
        const paxMatch = trimmedKey.match(/^(\d+)\s*PAX$/i) ?? trimmedKey.match(/^PAX\s*(\d+)$/i);

        if (!paxMatch) return;

        const paxCount = Number.parseInt(paxMatch[1], 10);
        const rateValue = cleanNumber(row[key]);

        if (!Number.isNaN(rateValue) && rateValue > 0) {
          parsedRates.push({
            segment: segmentName,
            paxRange: `${paxCount}`,
            minPax: paxCount,
            maxPax: paxCount,
            rate: rateValue,
            currency: String(row.Currency ?? row.currency ?? row.CURRENCY ?? 'USD'),
          });
        }
      });

      const rateKey = rowKeys.find((key) => key.trim().toUpperCase() === 'RATE');
      const rate = rateKey ? cleanNumber(row[rateKey]) : Number.NaN;

      if (Number.isNaN(rate) || rate <= 0) return;

      const minPaxKey = rowKeys.find((key) => {
        const normalized = key.trim().toUpperCase();
        return normalized === 'MINPAX' || normalized === 'MIN PAX';
      });

      const maxPaxKey = rowKeys.find((key) => {
        const normalized = key.trim().toUpperCase();
        return normalized === 'MAXPAX' || normalized === 'MAX PAX';
      });

      const paxKey = rowKeys.find((key) => key.trim().toUpperCase() === 'PAX');

      let minPax = minPaxKey ? cleanNumber(row[minPaxKey]) : Number.NaN;
      let maxPax = maxPaxKey ? cleanNumber(row[maxPaxKey]) : Number.NaN;
      const exactPax = paxKey ? cleanNumber(row[paxKey]) : Number.NaN;

      if (!Number.isNaN(exactPax) && Number.isNaN(minPax)) {
        minPax = exactPax;
        maxPax = exactPax;
      }

      if (!Number.isNaN(minPax) && !Number.isNaN(maxPax)) {
        parsedRates.push({
          segment: segmentName,
          paxRange: minPax === maxPax ? `${minPax}` : `${minPax}-${maxPax}`,
          minPax,
          maxPax,
          rate,
          currency: String(row.Currency ?? row.currency ?? row.CURRENCY ?? 'USD'),
        });
      }
    });

    if (parsedRates.length === 0) {
      throw new Error("No valid rates found. Please ensure your columns are named '1 PAX', '2 PAX', etc., or 'Rate'.");
    }

    return parsedRates;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(data.error || `Upload endpoint returned status ${response.status}`);
      }

      const rates: GroundServiceRate[] = data.rates;

      if (!Array.isArray(rates) || rates.length === 0) {
        throw new Error('No rates were returned from the upload API.');
      }

      await onRatesLoaded(rates);
      setSuccess(true);
    } catch (err: any) {
      console.error("Excel Upload Error:", err);
      setError(err.message || "Failed to parse Excel file.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
