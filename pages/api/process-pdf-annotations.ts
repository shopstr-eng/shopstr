import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// Disable body parsing for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

interface Annotation {
  id: string;
  type: "text" | "signature" | "drawing";
  x: number;
  y: number;
  content: string;
  page: number;
  width?: number;
  height?: number;
  paths?: Array<{ x: number; y: number }>;
  viewportWidth?: number;
  viewportHeight?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = formidable({
      uploadDir: "/tmp",
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
    });

    const [fields, files] = await form.parse(req);

    const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf;
    const annotationsField = Array.isArray(fields.annotations)
      ? fields.annotations[0]
      : fields.annotations;

    if (!pdfFile || !pdfFile.filepath) {
      return res.status(400).json({ error: "No PDF file provided" });
    }

    let annotations: Annotation[] = [];
    if (annotationsField) {
      try {
        annotations = JSON.parse(annotationsField as string);
      } catch (e) {
        console.error("Failed to parse annotations:", e);
        annotations = [];
      }
    }

    // Read the original PDF
    const pdfBytes = fs.readFileSync(pdfFile.filepath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Get standard font for text annotations
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Process annotations
    for (const annotation of annotations) {
      try {
        // Ensure page number is valid
        const pageIndex = Math.max(0, (annotation.page || 1) - 1);
        if (pageIndex >= pdfDoc.getPageCount()) {
          console.warn(
            `Page ${annotation.page} does not exist, skipping annotation`
          );
          continue;
        }

        const page = pdfDoc.getPage(pageIndex);
        const { height: pdfHeight, width: pdfWidth } = page.getSize();

        // Get the actual viewport dimensions that were used in the frontend
        // These should match the iframe dimensions when the annotations were created
        const viewportWidth = annotation.viewportWidth || 800; // fallback to typical width
        const viewportHeight = annotation.viewportHeight || 1000; // fallback to typical height

        // Calculate scale factors for both dimensions
        const scaleX = pdfWidth / viewportWidth;
        const scaleY = pdfHeight / viewportHeight;

        if (annotation.type === "text" && annotation.content?.trim()) {
          // Convert coordinates from viewer to PDF coordinate system
          // PDF.js viewer: top-left origin (0,0) at top-left
          // PDF-lib: bottom-left origin (0,0) at bottom-left
          const pdfX = Math.max(
            0,
            Math.min(annotation.x * scaleX, pdfWidth - 50)
          );
          const pdfY = Math.max(
            10,
            Math.min(pdfHeight - annotation.y * scaleY, pdfHeight - 10)
          );

          page.drawText(annotation.content, {
            x: pdfX,
            y: pdfY,
            size: 12,
            font: font,
            color: rgb(0, 0, 0),
          });
        } else if (
          (annotation.type === "drawing" || annotation.type === "signature") &&
          annotation.paths &&
          annotation.paths.length > 1
        ) {
          // Draw paths for drawing/signature annotations
          const color =
            annotation.type === "signature" ? rgb(0, 0.4, 0.8) : rgb(0, 0, 0);
          const lineWidth = annotation.type === "signature" ? 1.5 : 1;

          // Convert each point in the path to PDF coordinates
          const convertedPaths = annotation.paths.map((point) => ({
            x: Math.max(0, Math.min(point.x * scaleX, pdfWidth)),
            y: Math.max(0, Math.min(pdfHeight - point.y * scaleY, pdfHeight)),
          }));

          // Draw the path using multiple line segments
          if (convertedPaths.length > 1) {
            for (let i = 0; i < convertedPaths.length - 1; i++) {
              const start = convertedPaths[i];
              const end = convertedPaths[i + 1];

              page.drawLine({
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
                thickness: lineWidth,
                color: color,
              });
            }
          }
        }
      } catch (annotationError) {
        console.error("Error processing annotation:", annotationError);
        // Continue with other annotations even if one fails
      }
    }

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();

    // Clean up temp file
    try {
      fs.unlinkSync(pdfFile.filepath);
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="annotated.pdf"'
    );
    res.setHeader("Content-Length", modifiedPdfBytes.length);

    // Send the modified PDF
    res.send(Buffer.from(modifiedPdfBytes));
  } catch (error) {
    console.error("PDF processing error:", error);

    // Clean up temp files on error
    try {
      const form = formidable({
        uploadDir: "/tmp",
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024,
      });
      const [, files] = await form.parse(req);
      const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf;
      if (pdfFile?.filepath && fs.existsSync(pdfFile.filepath)) {
        fs.unlinkSync(pdfFile.filepath);
      }
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }

    res.status(500).json({
      error: "Failed to process PDF",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
