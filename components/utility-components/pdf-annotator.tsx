import React, { useRef, useEffect, useState } from "react";
import { Button } from "@nextui-org/react";

interface Annotation {
  id: string;
  type: "text" | "signature";
  x: number;
  y: number;
  content: string;
  page: number;
  width?: number;
  height?: number;
  paths?: Array<{ x: number; y: number }>; // For signature annotations
  viewportWidth?: number; // For coordinate mapping
  viewportHeight?: number; // For coordinate mapping
  fontSize?: number; // For text annotations
}

interface PDFAnnotatorProps {
  pdfUrl: string;
  onAnnotationsChange: (annotations: Annotation[]) => void;
  annotations: Annotation[];
}

export const PDFAnnotator: React.FC<PDFAnnotatorProps> = ({
  pdfUrl,
  onAnnotationsChange,
  annotations,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<"text" | "signature">(
    "signature"
  );
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [inputPosition, setInputPosition] = useState({ x: 0, y: 0 });
  const [textBoxSize, setTextBoxSize] = useState({ width: 200, height: 30 });
  const [currentPath, setCurrentPath] = useState<
    Array<{ x: number; y: number }>
  >([]);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mouseStartPos, setMouseStartPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [hasMoved, setHasMoved] = useState(false);

  // Page-specific states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageScale, setPageScale] = useState(1.0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  useEffect(() => {
    loadPDF();
  }, [pdfUrl]);

  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, pageScale]);

  useEffect(() => {
    // Small delay to ensure canvas is ready after page render
    const timer = setTimeout(() => {
      renderAnnotationsForCurrentPage();
    }, 50);

    return () => clearTimeout(timer);
  }, [annotations, currentPage, pageScale]);

  const loadPDF = async () => {
    if (!window.pdfjsLib) {
      // Load PDF.js library
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        loadPDFDocument();
      };
      document.head.appendChild(script);
    } else {
      loadPDFDocument();
    }
  };

  const loadPDFDocument = async () => {
    try {
      const pdf = await window.pdfjsLib.getDocument(pdfUrl).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
    } catch (error) {
      console.error("Error loading PDF:", error);
    }
  };

  const renderPage = async (pageNumber: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      // Calculate scale to fit the container
      const containerWidth = canvas.parentElement?.clientWidth || 800;
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(containerWidth / viewport.width, pageScale);
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.width = scaledViewport.width + "px";
      canvas.style.height = scaledViewport.height + "px";

      // Clear canvas
      context!.clearRect(0, 0, canvas.width, canvas.height);

      // Render PDF page
      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
      };

      await page.render(renderContext).promise;
      setPageScale(scale);

      // Update overlay to match canvas size
      if (overlayRef.current) {
        const overlay = overlayRef.current;
        overlay.style.width = scaledViewport.width + "px";
        overlay.style.height = scaledViewport.height + "px";
      }

      // Render annotations after page is ready
      setTimeout(() => {
        renderAnnotationsForCurrentPage();
      }, 100);
    } catch (error) {
      console.error("Error rendering page:", error);
    }
  };

  const renderAnnotationsForCurrentPage = () => {
    if (!overlayRef.current || !canvasRef.current) return;

    // Clear existing annotations
    overlayRef.current.innerHTML = "";

    // Get canvas context for drawing signatures
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Filter annotations for current page
    const pageAnnotations = annotations.filter(
      (ann) => ann.page === currentPage
    );

    pageAnnotations.forEach((annotation) => {
      if (annotation.type === "text") {
        const element = document.createElement("div");
        element.style.position = "absolute";
        element.style.left = `${annotation.x}px`;
        element.style.top = `${annotation.y}px`;
        element.style.width = `${annotation.width || 200}px`;
        element.style.height = `${annotation.height || 30}px`;
        element.style.pointerEvents = "none";
        element.textContent = annotation.content;
        element.style.background = "rgba(255, 255, 0, 0.3)";
        element.style.border = "1px solid #666";
        element.style.padding = "4px";
        element.style.fontSize = `${annotation.fontSize || 14}px`;
        element.style.fontFamily = "Arial, sans-serif";
        element.style.color = "#000";
        element.style.overflow = "hidden";
        element.style.wordWrap = "break-word";
        element.style.display = "flex";
        element.style.alignItems = "center";
        overlayRef.current!.appendChild(element);
      } else if (annotation.type === "signature" && annotation.paths) {
        // Render signature paths on canvas
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (annotation.paths.length > 1) {
          ctx.beginPath();
          ctx.moveTo(annotation.paths[0]!.x, annotation.paths[0]!.y);

          for (let i = 1; i < annotation.paths.length; i++) {
            ctx.lineTo(annotation.paths[i]!.x, annotation.paths[i]!.y);
          }

          ctx.stroke();
        }
      }
    });
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (currentTool !== "text") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    setInputPosition({ x: clickX, y: clickY });
    setShowTextInput(true);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool !== "signature") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const x = event.clientX - canvasRect.left;
    const y = event.clientY - canvasRect.top;

    if (x < 0 || y < 0 || x >= canvas.clientWidth || y >= canvas.clientHeight) {
      return;
    }

    setIsMouseDown(true);
    setMouseStartPos({ x: event.clientX, y: event.clientY });
    setHasMoved(false);
    setCurrentPath([{ x, y }]);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDown) return;

    if (mouseStartPos && !hasMoved) {
      const distance = Math.sqrt(
        Math.pow(event.clientX - mouseStartPos.x, 2) +
          Math.pow(event.clientY - mouseStartPos.y, 2)
      );

      if (distance > 3) {
        setHasMoved(true);
        setIsDrawing(true);
      } else {
        return;
      }
    }

    if (!isDrawing || !hasMoved) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const x = event.clientX - canvasRect.left;
    const y = event.clientY - canvasRect.top;

    if (x < 0 || y < 0 || x >= canvas.clientWidth || y >= canvas.clientHeight) {
      return;
    }

    const newPath = [...currentPath, { x, y }];
    setCurrentPath(newPath);

    // Draw current path being drawn directly without re-rendering the entire page
    const ctx = canvas.getContext("2d");
    if (ctx && newPath.length > 1) {
      // Only draw the latest line segment to avoid performance issues
      const prevPoint = newPath[newPath.length - 2];
      const currentPoint = newPath[newPath.length - 1];

      ctx.strokeStyle = "#0066cc";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(prevPoint!.x, prevPoint!.y);
      ctx.lineTo(currentPoint!.x, currentPoint!.y);
      ctx.stroke();
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && hasMoved && currentPath.length > 1) {
      const canvas = canvasRef.current;
      const viewportWidth = canvas?.width || 800;
      const viewportHeight = canvas?.height || 1000;

      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "signature",
        x: Math.min(...currentPath.map((p) => p.x)),
        y: Math.min(...currentPath.map((p) => p.y)),
        content: "",
        page: currentPage,
        width:
          Math.max(...currentPath.map((p) => p.x)) -
          Math.min(...currentPath.map((p) => p.x)),
        height:
          Math.max(...currentPath.map((p) => p.y)) -
          Math.min(...currentPath.map((p) => p.y)),
        paths: currentPath,
        viewportWidth,
        viewportHeight,
      };

      const updatedAnnotations = [...annotations, newAnnotation];
      onAnnotationsChange(updatedAnnotations);
    }

    setIsDrawing(false);
    setIsMouseDown(false);
    setMouseStartPos(null);
    setHasMoved(false);
    setCurrentPath([]);
  };

  const addTextAnnotation = () => {
    if (!textInput.trim()) return;

    const canvas = canvasRef.current;
    const viewportWidth = canvas?.width || 800;
    const viewportHeight = canvas?.height || 1000;
    const fontSize = Math.max(10, Math.min(textBoxSize.height - 8, 16));

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: "text",
      x: inputPosition.x,
      y: inputPosition.y,
      content: textInput,
      page: currentPage,
      width: textBoxSize.width,
      height: textBoxSize.height,
      fontSize,
      viewportWidth,
      viewportHeight,
    };

    const updatedAnnotations = [...annotations, newAnnotation];
    onAnnotationsChange(updatedAnnotations);
    setTextInput("");
    setShowTextInput(false);
    setTextBoxSize({ width: 200, height: 30 });
  };

  const clearAnnotations = () => {
    // Immediately clear the visual display first
    if (overlayRef.current && canvasRef.current) {
      overlayRef.current.innerHTML = "";
      const ctx = canvasRef.current.getContext("2d");
      if (ctx && pdfDoc) {
        // Re-render just the PDF page without annotations
        renderPage(currentPage).then(() => {
          // Update state after visual clearing is complete
          onAnnotationsChange([]);
        });
      }
    } else {
      onAnnotationsChange([]);
    }
  };

  const clearCurrentPageAnnotations = () => {
    const filteredAnnotations = annotations.filter(
      (ann) => ann.page !== currentPage
    );
    // Immediately clear the visual display for current page first
    if (overlayRef.current && canvasRef.current) {
      overlayRef.current.innerHTML = "";
      const ctx = canvasRef.current.getContext("2d");
      if (ctx && pdfDoc) {
        // Re-render just the PDF page without annotations
        renderPage(currentPage).then(() => {
          // Update state after visual clearing is complete
          onAnnotationsChange(filteredAnnotations);
        });
      }
    } else {
      onAnnotationsChange(filteredAnnotations);
    }
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="z-10 mb-4 flex flex-wrap items-center gap-2 border-b bg-white py-2">
        <Button
          size="sm"
          variant={currentTool === "text" ? "solid" : "bordered"}
          onClick={() => setCurrentTool("text")}
          className="text-light-text"
        >
          Add Text
        </Button>

        <Button
          size="sm"
          variant={currentTool === "signature" ? "solid" : "bordered"}
          onClick={() => setCurrentTool("signature")}
          color="warning"
        >
          Signature
        </Button>

        <div className="mx-4 flex items-center gap-2">
          <Button
            size="sm"
            variant="bordered"
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="text-light-text"
          >
            Previous
          </Button>

          <span className="text-sm">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            size="sm"
            variant="bordered"
            onClick={nextPage}
            disabled={currentPage >= totalPages}
            className="text-light-text"
          >
            Next
          </Button>
        </div>

        <Button
          size="sm"
          variant="bordered"
          onClick={clearCurrentPageAnnotations}
          color="warning"
        >
          Clear Page
        </Button>

        <Button
          size="sm"
          variant="bordered"
          onClick={clearAnnotations}
          color="danger"
        >
          Clear All
        </Button>
      </div>

      <div className="relative flex flex-grow justify-center">
        <div className="relative rounded border bg-gray-100 p-4">
          {/* PDF Canvas */}
          <canvas
            ref={canvasRef}
            className={`block bg-white shadow-lg ${
              currentTool === "signature" ? "cursor-crosshair" : ""
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />

          {/* Text Annotations Overlay */}
          <div
            ref={overlayRef}
            className={`absolute left-4 top-4 ${
              currentTool === "text"
                ? "cursor-crosshair"
                : "pointer-events-none"
            }`}
            onClick={handleOverlayClick}
            style={{
              pointerEvents: currentTool === "text" ? "auto" : "none",
            }}
          />
        </div>

        {showTextInput && (
          <div
            className="absolute z-30 rounded border bg-white p-3 shadow-lg"
            style={{
              left: Math.min(inputPosition.x, window.innerWidth - 300),
              top: Math.min(inputPosition.y, window.innerHeight - 200),
              minWidth: "280px",
            }}
          >
            <div className="mb-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Text Content:
              </label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter text"
                className="w-full resize-none rounded border px-2 py-1 text-sm"
                rows={2}
                autoFocus
              />
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Width:
                </label>
                <input
                  type="number"
                  value={textBoxSize.width}
                  onChange={(e) =>
                    setTextBoxSize((prev) => ({
                      ...prev,
                      width: parseInt(e.target.value) || 200,
                    }))
                  }
                  className="w-full rounded border px-2 py-1 text-sm"
                  min="50"
                  max="500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Height:
                </label>
                <input
                  type="number"
                  value={textBoxSize.height}
                  onChange={(e) =>
                    setTextBoxSize((prev) => ({
                      ...prev,
                      height: parseInt(e.target.value) || 30,
                    }))
                  }
                  className="w-full rounded border px-2 py-1 text-sm"
                  min="20"
                  max="100"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={addTextAnnotation}
                disabled={!textInput.trim()}
                className="flex-1"
              >
                Add Text
              </Button>
              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  setShowTextInput(false);
                  setTextInput("");
                  setTextBoxSize({ width: 200, height: 30 });
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Extend window for PDF.js
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

export default PDFAnnotator;
