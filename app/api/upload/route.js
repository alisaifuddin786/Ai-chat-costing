import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { promises as fs } from 'node:fs';
import formidable from 'formidable';
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toNodeRequest(request) {
  const headers = Object.fromEntries(request.headers.entries());
  const stream = Readable.fromWeb(request.body);

  stream.headers = headers;
  stream.method = request.method;
  stream.url = request.url;

  return stream;
}

function parseMultipartForm(request) {
  const form = formidable({
    multiples: false,
    maxFileSize: MAX_FILE_SIZE,
    allowEmptyFiles: false,
    uploadDir: '/tmp',
    keepExtensions: true,
    filter: ({ mimetype, originalFilename }) => {
      if (!originalFilename) return false;

      const allowedMimes = new Set([
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ]);

      if (mimetype && allowedMimes.has(mimetype)) {
        return true;
      }

      return /\.(xls|xlsx)$/i.test(originalFilename);
    },
  });

  const nodeRequest = toNodeRequest(request);

  return new Promise((resolve, reject) => {
    form.parse(nodeRequest, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getUploadedFile(files) {
  const allFiles = Object.values(files).flat();
  return allFiles[0];
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

    const { files } = await parseMultipartForm(request);
    const uploadedFile = getUploadedFile(files);

    if (!uploadedFile) {
      return NextResponse.json(
        { error: 'No Excel file uploaded. Attach a file field in the form-data payload.' },
        { status: 400 },
      );
    }

    const fileBuffer = await fs.readFile(uploadedFile.filepath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    if (!workbook.SheetNames.length) {
      return NextResponse.json(
        { error: 'Uploaded workbook does not contain any sheets.' },
        { status: 400 },
      );
    }

    const parsedData = workbook.SheetNames.map((sheetName) => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: null,
        raw: false,
      }),
    }));

    return NextResponse.json({
      success: true,
      fileName: uploadedFile.originalFilename,
      data: parsedData,
    });
  } catch (error) {
    if (error?.code === 1009) {
      return NextResponse.json(
        { error: 'File is too large. Maximum upload size is 5MB.' },
        { status: 413 },
      );
    }

    if (error?.httpCode === 400) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error('Excel upload parsing failed:', error);

    return NextResponse.json(
      {
        error: 'Failed to process Excel file upload.',
      },
      { status: 500 },
    );
  }
}
