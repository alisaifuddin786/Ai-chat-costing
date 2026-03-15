import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanNumber(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    return Number(val.replace(/[$,\s]/g, ''));
  }
  return Number.NaN;
}

function extractRates(rows) {
  const parsedRates = [];

  rows.forEach((row) => {
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

    const minPaxKey = rowKeys.find((key) => ['MINPAX', 'MIN PAX'].includes(key.trim().toUpperCase()));
    const maxPaxKey = rowKeys.find((key) => ['MAXPAX', 'MAX PAX'].includes(key.trim().toUpperCase()));
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

  return parsedRates;
}

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data.' },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const uploadedFile = formData.get('file');

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(
        { error: 'No Excel file uploaded. Attach a file field in the form-data payload.' },
        { status: 400 },
      );
    }

    if (uploadedFile.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 });
    }

    if (uploadedFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File is too large. Maximum upload size is 5MB.' },
        { status: 413 },
      );
    }

    const fileName = uploadedFile.name || '';
    const mimeType = uploadedFile.type || '';
    const allowedMimes = new Set([
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
    ]);

    if (!allowedMimes.has(mimeType) && !/\.(xls|xlsx|csv)$/i.test(fileName)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload .xls, .xlsx, or .csv files.' },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    if (!workbook.SheetNames.length) {
      return NextResponse.json(
        { error: 'Uploaded workbook does not contain any sheets.' },
        { status: 400 },
      );
    }

    const data = workbook.SheetNames.map((sheetName) => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: null,
        raw: false,
      }),
    }));

    const rates = extractRates(data[0]?.rows ?? []);

    if (!rates.length) {
      return NextResponse.json(
        { error: 'No valid rates were found in the first sheet.' },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      fileName,
      rates,
      data,
    });
  } catch (error) {
    console.error('Excel upload parsing failed:', error);

    return NextResponse.json(
      {
        error: 'Failed to process Excel file upload.',
      },
      { status: 500 },
    );
  }
}
