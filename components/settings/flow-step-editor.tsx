import { useState, useRef, useCallback, useContext } from "react";
import { Button, Input, Progress } from "@nextui-org/react";
import {
  blossomUpload,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  ArrowUpTrayIcon,
  LinkIcon,
  MinusIcon,
  EyeIcon,
  CodeBracketIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const TOOLBAR_BTN =
  "min-w-0 h-8 w-8 p-0 border-2 border-black bg-white rounded-md shadow-none hover:bg-primary-yellow transition-colors";
const TOOLBAR_BTN_ACTIVE =
  "min-w-0 h-8 w-8 p-0 border-2 border-black bg-primary-yellow rounded-md shadow-none";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const FLASH_DURATION = 1500;

interface FlowStepEditorProps {
  value: string;
  onChange: (html: string) => void;
}

interface InsertModalState {
  type: "link" | "button" | null;
  text: string;
  url: string;
}

export const FlowStepEditor = ({ value, onChange }: FlowStepEditorProps) => {
  const [showRawHtml, setShowRawHtml] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [insertModal, setInsertModal] = useState<InsertModalState>({
    type: null,
    text: "",
    url: "",
  });
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { signer, isLoggedIn } = useContext(SignerContext);

  const triggerFlash = useCallback(() => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setIsFlashing(true);
    flashTimerRef.current = setTimeout(
      () => setIsFlashing(false),
      FLASH_DURATION
    );
  }, []);

  const insertAtCursor = useCallback(
    (html: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + html);
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = value.substring(0, start) + html + value.substring(end);
      onChange(newValue);
      triggerFlash();
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + html.length);
      }, 0);
    },
    [value, onChange, triggerFlash]
  );

  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end);
      const wrapped = before + (selected || "text") + after;
      const newValue =
        value.substring(0, start) + wrapped + value.substring(end);
      onChange(newValue);
      triggerFlash();
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + wrapped.length);
      }, 0);
    },
    [value, onChange, triggerFlash]
  );

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !isLoggedIn || !signer) return;

    const file = files[0];
    if (!file || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setUploadError("Only JPEG, PNG, or WebP images are supported.");
      return;
    }

    setUploadProgress(10);
    setUploadError(null);

    try {
      const { blossomServers } = getLocalStorageData();
      setUploadProgress(30);

      const tags = await blossomUpload(
        file,
        true,
        signer,
        blossomServers && blossomServers.length > 0
          ? blossomServers
          : ["https://cdn.nostrcheck.me"]
      );

      setUploadProgress(90);

      const urlTag = tags?.find(
        (tag: string[]) => Array.isArray(tag) && tag[0] === "url"
      );
      if (urlTag && urlTag.length > 1) {
        const imgHtml = `<img src="${urlTag[1]}" alt="Email image" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;" />`;
        insertAtCursor(imgHtml);
        setUploadProgress(100);
        setTimeout(() => setUploadProgress(null), 800);
      } else {
        setUploadError(
          "Upload failed to return a URL. Try again or check your Blossom server in settings."
        );
      }
    } catch (err: any) {
      setUploadError(err?.message || "Image upload failed.");
      setUploadProgress(null);
    }

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const handleInsertLink = () => {
    if (!insertModal.url) return;
    const text = insertModal.text || insertModal.url;
    const linkHtml = `<a href="${insertModal.url}" style="color:#2563eb;text-decoration:underline;">${text}</a>`;
    insertAtCursor(linkHtml);
    setInsertModal({ type: null, text: "", url: "" });
  };

  const handleInsertButton = () => {
    if (!insertModal.url) return;
    const text = insertModal.text || "Click Here";
    const buttonHtml = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="${insertModal.url}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">${text}</a>
    </td>
  </tr>
</table>`;
    insertAtCursor(buttonHtml);
    setInsertModal({ type: null, text: "", url: "" });
  };

  const handleInsertDivider = () => {
    insertAtCursor(
      `<hr style="border:none;border-top:2px solid #e5e7eb;margin:24px 0;" />`
    );
  };

  const handleInsertHeading = () => {
    wrapSelection(
      `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">`,
      `</h2>`
    );
  };

  const handleInsertParagraph = () => {
    wrapSelection(
      `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">`,
      `</p>`
    );
  };

  const handleBold = () => {
    wrapSelection(`<strong>`, `</strong>`);
  };

  const handleItalic = () => {
    wrapSelection(`<em>`, `</em>`);
  };

  if (showPreview) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-600">Preview</span>
          <Button
            className={TOOLBAR_BTN}
            size="sm"
            onClick={() => setShowPreview(false)}
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
          </Button>
        </div>
        <div
          className="min-h-[200px] rounded-md border-2 border-black bg-white p-4"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      </div>
    );
  }

  return (
    <div>
      <input
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        ref={imageInputRef}
        onChange={handleImageSelect}
        className="hidden"
      />

      <div className="flex flex-wrap items-center gap-1 rounded-t-md border-2 border-b-0 border-black bg-gray-50 p-2">
        <Button className={TOOLBAR_BTN} size="sm" onClick={handleInsertHeading}>
          <span className="text-xs font-black">H</span>
        </Button>
        <Button
          className={TOOLBAR_BTN}
          size="sm"
          onClick={handleInsertParagraph}
        >
          <span className="text-xs font-bold">P</span>
        </Button>
        <Button className={TOOLBAR_BTN} size="sm" onClick={handleBold}>
          <span className="text-xs font-black">B</span>
        </Button>
        <Button className={TOOLBAR_BTN} size="sm" onClick={handleItalic}>
          <span className="text-xs italic">I</span>
        </Button>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <Button
          className={TOOLBAR_BTN}
          size="sm"
          onClick={() => imageInputRef.current?.click()}
          isDisabled={uploadProgress !== null}
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
        </Button>
        <Button
          className={
            insertModal.type === "link" ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN
          }
          size="sm"
          onClick={() =>
            setInsertModal({
              type: insertModal.type === "link" ? null : "link",
              text: "",
              url: "",
            })
          }
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button
          className={
            insertModal.type === "button" ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN
          }
          size="sm"
          onClick={() =>
            setInsertModal({
              type: insertModal.type === "button" ? null : "button",
              text: "",
              url: "",
            })
          }
        >
          <span className="rounded border border-black px-1 text-[9px] font-bold">
            BTN
          </span>
        </Button>
        <Button className={TOOLBAR_BTN} size="sm" onClick={handleInsertDivider}>
          <MinusIcon className="h-4 w-4" />
        </Button>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <Button
          className={TOOLBAR_BTN}
          size="sm"
          onClick={() => setShowPreview(true)}
        >
          <EyeIcon className="h-4 w-4" />
        </Button>
        <Button
          className={showRawHtml ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
          size="sm"
          onClick={() => setShowRawHtml(!showRawHtml)}
        >
          <CodeBracketIcon className="h-4 w-4" />
        </Button>
      </div>

      {uploadProgress !== null && (
        <div className="flex items-center gap-3 border-2 border-b-0 border-t-0 border-black bg-gray-50 px-3 py-2">
          <span className="flex-shrink-0 text-xs font-bold text-gray-600">
            Uploading image
          </span>
          <Progress
            aria-label="Upload progress"
            size="sm"
            value={uploadProgress}
            classNames={{
              base: "flex-1",
              track: "h-2 rounded-full border border-gray-300 bg-white",
              indicator: "bg-primary-blue",
            }}
          />
          <span className="flex-shrink-0 text-xs text-gray-500">
            {uploadProgress}%
          </span>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 border-2 border-b-0 border-t-0 border-black bg-red-50 px-3 py-2">
          <span className="flex-1 text-xs text-red-700">{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="flex-shrink-0 text-red-400 hover:text-red-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {insertModal.type && (
        <div className="border-2 border-b-0 border-t-0 border-black bg-blue-50 px-3 py-3">
          <p className="mb-2 text-xs font-bold text-gray-700">
            {insertModal.type === "button" ? "Insert Button" : "Insert Link"}
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-600">
                {insertModal.type === "button" ? "Button text" : "Link text"}
              </label>
              <input
                type="text"
                value={insertModal.text}
                onChange={(e) =>
                  setInsertModal({ ...insertModal, text: e.target.value })
                }
                placeholder={
                  insertModal.type === "button" ? "Shop Now" : "Click here"
                }
                className="h-8 w-full rounded-md border-2 border-black bg-white px-2 text-sm text-black placeholder-gray-400 outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-600">URL</label>
              <input
                type="text"
                value={insertModal.url}
                onChange={(e) =>
                  setInsertModal({ ...insertModal, url: e.target.value })
                }
                placeholder="https://..."
                className="h-8 w-full rounded-md border-2 border-black bg-white px-2 text-sm text-black placeholder-gray-400 outline-none"
              />
            </div>
            <Button
              className="h-8 min-w-0 rounded-md border-2 border-black bg-primary-blue px-3 text-xs font-bold text-white shadow-none"
              size="sm"
              onClick={
                insertModal.type === "button"
                  ? handleInsertButton
                  : handleInsertLink
              }
              isDisabled={!insertModal.url}
            >
              Insert
            </Button>
            <button
              type="button"
              onClick={() => setInsertModal({ type: null, text: "", url: "" })}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-gray-400 hover:text-black"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {showRawHtml ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full border-2 bg-white p-3 font-mono text-sm text-black outline-none duration-300 transition-colors ${
            isFlashing ? "border-primary-blue bg-blue-50" : "border-black"
          }`}
          rows={12}
          placeholder="<h2>Hi {{buyer_name}},</h2>&#10;<p>Thanks for your purchase!</p>"
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full border-2 bg-white p-3 text-sm text-black outline-none duration-300 transition-colors ${
            isFlashing ? "border-primary-blue bg-blue-50" : "border-black"
          }`}
          rows={12}
          placeholder="Use the toolbar above to format your email, or type HTML directly. Use the code icon to switch to raw HTML mode."
        />
      )}

      <div className="flex flex-wrap items-center gap-1 rounded-b-md border-2 border-t-0 border-black bg-gray-50 px-3 py-2">
        <span className="mr-1 text-xs font-bold text-gray-500">
          Merge tags:
        </span>
        {[
          "{{buyer_name}}",
          "{{shop_name}}",
          "{{product_title}}",
          "{{order_id}}",
          "{{shop_url}}",
        ].map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => insertAtCursor(tag)}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-xs text-gray-700 transition-colors hover:border-black hover:bg-primary-yellow"
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
};
