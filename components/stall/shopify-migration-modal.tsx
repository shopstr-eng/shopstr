"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Progress,
} from "@heroui/react";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  DocumentArrowUpIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
  CATEGORIES,
  SHIPPING_OPTIONS,
} from "@/utils/STATIC-VARIABLES";
import {
  PostListing,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ProductContext } from "@/utils/context/context";
import {
  parseShopifyProductCsv,
  type ShopifyParseResult,
  type ShopifyProduct,
} from "@/utils/migrations/shopify-csv-parser";
import {
  buildListingsFromShopifyProducts,
  type BuiltShopifyListing,
} from "@/utils/migrations/shopify-to-nip99";
import { rehostListingImages } from "@/utils/migrations/rehost-images";
import currencySelection from "../../public/currencySelection.json";

interface ShopifyMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "upload" | "configure" | "review" | "publish" | "done";

interface PublishResult {
  handle: string;
  title: string;
  status: "success" | "error";
  message?: string;
  warnings?: string[];
}

const ACCEPTED_TYPES = [".csv", "text/csv", "application/vnd.ms-excel"];

const MIGRATION_INPUT_CLASSNAMES = {
  input: "bg-white !text-black placeholder:!text-gray-500",
  inputWrapper:
    "bg-white border-2 border-black rounded-md data-[hover=true]:bg-white group-data-[focus=true]:border-primary-yellow",
  label: "text-black font-bold",
};

const MIGRATION_SELECT_CLASSNAMES = {
  trigger:
    "bg-white border-2 border-black rounded-md data-[hover=true]:bg-white",
  value: "!text-black",
  label: "text-black font-bold",
  popoverContent: "border-2 border-black rounded-md bg-white",
  listbox: "!text-black",
};

export default function ShopifyMigrationModal({
  isOpen,
  onClose,
}: ShopifyMigrationModalProps) {
  const { signer, isLoggedIn, pubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const productEventContext = useContext(ProductContext);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<ShopifyParseResult | null>(
    null
  );
  const [parseError, setParseError] = useState<string | null>(null);

  // Configuration
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [defaultCategory, setDefaultCategory] = useState(CATEGORIES[0] ?? "");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [defaultShippingOption, setDefaultShippingOption] = useState<string>(
    SHIPPING_OPTIONS[0] ?? "Pickup"
  );
  const [defaultShippingCost, setDefaultShippingCost] = useState("0");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [pickupLocation, setPickupLocation] = useState("");

  // Selection of products to import
  const [selectedHandles, setSelectedHandles] = useState<Set<string>>(
    new Set()
  );

  // Publish progress
  const [publishProgress, setPublishProgress] = useState(0);
  const [publishTotal, setPublishTotal] = useState(0);
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string>("");
  const [failedListings, setFailedListings] = useState<BuiltShopifyListing[]>(
    []
  );
  const cancelRef = useRef(false);

  const currencyOptions = useMemo(
    () =>
      Object.keys(currencySelection).map((code) => ({
        value: code,
        label: code,
      })),
    []
  );

  useEffect(() => {
    if (!isOpen) {
      // Reset on close
      setStep("upload");
      setFileName("");
      setParseResult(null);
      setParseError(null);
      setSelectedHandles(new Set());
      setPublishProgress(0);
      setPublishTotal(0);
      setPublishResults([]);
      setIsPublishing(false);
      setPublishStatus("");
      setFailedListings([]);
      cancelRef.current = false;
    }
  }, [isOpen]);

  const handleFileSelected = async (file: File) => {
    setParseError(null);
    setParseResult(null);
    setFileName(file.name);

    if (file.size > 25 * 1024 * 1024) {
      setParseError(
        "File is larger than 25 MB. Please split it into smaller exports."
      );
      return;
    }

    try {
      const text = await file.text();
      const result = parseShopifyProductCsv(text);
      if (result.products.length === 0) {
        setParseError(
          result.errors.join(" \n") ||
            "No products were found in this file. Make sure it is a Shopify product export."
        );
        return;
      }
      setParseResult(result);
      setSelectedHandles(new Set(result.products.map((p) => p.handle)));
      setStep("configure");
    } catch (err) {
      console.error("Failed to parse Shopify CSV:", err);
      setParseError(
        err instanceof Error
          ? err.message
          : "Could not read the file. Please make sure it is a valid CSV."
      );
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFileSelected(file);
  };

  const productsToReview: BuiltShopifyListing[] = useMemo(() => {
    if (!parseResult) return [];
    const filtered = parseResult.products.filter((p) =>
      selectedHandles.has(p.handle)
    );
    return buildListingsFromShopifyProducts(filtered, {
      pubkey: pubkey || "",
      relayHint: getLocalStorageData().relays?.[0] ?? "",
      defaultCurrency,
      defaultCategory,
      defaultLocation,
      defaultShippingOption,
      defaultShippingCost,
      pickupLocations: pickupLocation ? [pickupLocation] : [],
      includeDrafts: true, // already filtered above
    });
  }, [
    parseResult,
    selectedHandles,
    pubkey,
    defaultCurrency,
    defaultCategory,
    defaultLocation,
    defaultShippingOption,
    defaultShippingCost,
    pickupLocation,
  ]);

  const filteredByDraftSelection = useMemo(() => {
    if (!parseResult) return [];
    if (includeDrafts) return parseResult.products;
    return parseResult.products.filter(
      (p) => (p.status || "active").toLowerCase() === "active"
    );
  }, [parseResult, includeDrafts]);

  const toggleHandle = (handle: string) => {
    setSelectedHandles((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  };

  const toggleAll = () => {
    if (!parseResult) return;
    const allSelected = filteredByDraftSelection.every((p) =>
      selectedHandles.has(p.handle)
    );
    if (allSelected) {
      setSelectedHandles(new Set());
    } else {
      setSelectedHandles(
        new Set(filteredByDraftSelection.map((p) => p.handle))
      );
    }
  };

  const runPublish = async (items: BuiltShopifyListing[]) => {
    if (!signer || !isLoggedIn || !nostr) {
      setParseError(
        "You must be signed in to publish listings. Please sign in and try again."
      );
      return;
    }
    if (items.length === 0) {
      return;
    }

    setStep("publish");
    setIsPublishing(true);
    cancelRef.current = false;
    setPublishProgress(0);
    setPublishTotal(items.length);
    setPublishResults([]);
    setPublishStatus("");
    const results: PublishResult[] = [];
    const failures: BuiltShopifyListing[] = [];

    for (let i = 0; i < items.length; i++) {
      if (cancelRef.current) break;
      const item = items[i]!;
      const title = item.product.title || item.product.handle;
      const rehostWarnings: string[] = [];
      let valuesToPublish = item.values;

      // Step A: rehost any remote image URLs to the user's Blossom server so
      // the listings keep working even if the seller decommissions Shopify.
      try {
        setPublishStatus(`Re-uploading images for "${title}"…`);
        const rehosted = await rehostListingImages(
          item.values,
          signer,
          title,
          (p) => {
            setPublishStatus(
              `Re-uploading image ${Math.min(p.done + 1, p.total)} / ${p.total} for "${title}"…`
            );
          }
        );
        valuesToPublish = rehosted.values;
        rehostWarnings.push(...rehosted.warnings);
      } catch (err) {
        console.error("Image rehosting failed for", item.product.handle, err);
        rehostWarnings.push(
          `"${title}": image re-upload failed (${err instanceof Error ? err.message : "unknown error"}). Listing was published with the original Shopify image links.`
        );
      }

      // Step B: publish the (possibly updated) listing to Nostr.
      try {
        setPublishStatus(`Publishing "${title}" to Nostr…`);
        const signed = await PostListing(
          valuesToPublish,
          signer,
          isLoggedIn,
          nostr
        );
        if (signed) {
          productEventContext.addNewlyCreatedProductEvent(signed);
        }
        results.push({
          handle: item.product.handle,
          title,
          status: "success",
          warnings: rehostWarnings.length ? rehostWarnings : undefined,
        });
      } catch (err) {
        console.error(
          "Failed to publish migrated listing:",
          item.product.handle,
          err
        );
        results.push({
          handle: item.product.handle,
          title,
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
          warnings: rehostWarnings.length ? rehostWarnings : undefined,
        });
        failures.push(item);
      }
      setPublishProgress(i + 1);
      setPublishResults([...results]);
    }

    setFailedListings(failures);
    setPublishStatus("");
    setIsPublishing(false);
    setStep("done");
  };

  const startPublish = () => runPublish(productsToReview);
  const retryFailed = () => runPublish(failedListings);

  const cancelPublish = () => {
    cancelRef.current = true;
  };

  const handleClose = () => {
    if (isPublishing) return; // prevent close mid-publish
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      backdrop="blur"
      size="3xl"
      isDismissable={!isPublishing}
      hideCloseButton={isPublishing}
      scrollBehavior="inside"
      classNames={{
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        header: "border-b-2 border-black bg-white rounded-t-md text-black",
        body: "py-6 bg-white",
        footer: "border-t-2 border-black bg-white rounded-b-md",
        closeButton:
          "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-black">Migrate from Shopify</h2>
          <p className="text-sm font-normal text-gray-600">
            Step {stepNumber(step)} of 4 ·{" "}
            {step === "upload" && "Upload your Shopify export"}
            {step === "configure" && "Set defaults for your listings"}
            {step === "review" && "Review what will be published"}
            {step === "publish" && "Publishing to Nostr"}
            {step === "done" && "Migration complete"}
          </p>
        </ModalHeader>
        <ModalBody>
          {step === "upload" && (
            <UploadStep
              fileName={fileName}
              parseError={parseError}
              onPickFile={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              fileInputRef={fileInputRef}
              onFileChange={(f) => f && handleFileSelected(f)}
            />
          )}

          {step === "configure" && parseResult && (
            <ConfigureStep
              parseResult={parseResult}
              filteredByDraftSelection={filteredByDraftSelection}
              selectedHandles={selectedHandles}
              toggleAll={toggleAll}
              toggleHandle={toggleHandle}
              defaultCurrency={defaultCurrency}
              setDefaultCurrency={setDefaultCurrency}
              currencyOptions={currencyOptions}
              defaultCategory={defaultCategory}
              setDefaultCategory={setDefaultCategory}
              defaultLocation={defaultLocation}
              setDefaultLocation={setDefaultLocation}
              defaultShippingOption={defaultShippingOption}
              setDefaultShippingOption={setDefaultShippingOption}
              defaultShippingCost={defaultShippingCost}
              setDefaultShippingCost={setDefaultShippingCost}
              includeDrafts={includeDrafts}
              setIncludeDrafts={setIncludeDrafts}
              pickupLocation={pickupLocation}
              setPickupLocation={setPickupLocation}
            />
          )}

          {step === "review" && <ReviewStep listings={productsToReview} />}

          {step === "publish" && (
            <PublishStep
              progress={publishProgress}
              total={publishTotal}
              results={publishResults}
              status={publishStatus}
            />
          )}

          {step === "done" && <DoneStep results={publishResults} />}
        </ModalBody>
        <ModalFooter>
          {step === "upload" && (
            <Button className={WHITEBUTTONCLASSNAMES} onClick={onClose}>
              Cancel
            </Button>
          )}

          {step === "configure" && (
            <>
              <Button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => setStep("upload")}
              >
                Back
              </Button>
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={() => setStep("review")}
                isDisabled={selectedHandles.size === 0}
              >
                Review {selectedHandles.size} listing
                {selectedHandles.size === 1 ? "" : "s"}
              </Button>
            </>
          )}

          {step === "review" && (
            <>
              <Button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => setStep("configure")}
              >
                Back
              </Button>
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={() => void startPublish()}
                isDisabled={productsToReview.length === 0}
              >
                Publish {productsToReview.length} listing
                {productsToReview.length === 1 ? "" : "s"}
              </Button>
            </>
          )}

          {step === "publish" && (
            <Button className={WHITEBUTTONCLASSNAMES} onClick={cancelPublish}>
              Stop after current
            </Button>
          )}

          {step === "done" && (
            <>
              {failedListings.length > 0 && (
                <Button
                  className={WHITEBUTTONCLASSNAMES}
                  onClick={() => void retryFailed()}
                >
                  Retry {failedListings.length} failed
                </Button>
              )}
              <Button className={BLUEBUTTONCLASSNAMES} onClick={onClose}>
                Done
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function stepNumber(step: Step): number {
  switch (step) {
    case "upload":
      return 1;
    case "configure":
      return 2;
    case "review":
      return 3;
    case "publish":
    case "done":
      return 4;
  }
}

interface UploadStepProps {
  fileName: string;
  parseError: string | null;
  onPickFile: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (f: File | null) => void;
}

function UploadStep({
  fileName,
  parseError,
  onPickFile,
  onDrop,
  fileInputRef,
  onFileChange,
}: UploadStepProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-md border-2 border-black bg-yellow-50 p-4">
        <h3 className="mb-2 font-bold text-black">
          How to export from Shopify
        </h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-black">
          <li>
            In your Shopify admin, open <b>Products</b> and click <b>Export</b>.
          </li>
          <li>
            Choose <b>All products</b> (or selected) and the{" "}
            <b>CSV for Excel, Numbers or other spreadsheet programs</b> format.
          </li>
          <li>
            Download the file and upload it below. Variant rows are grouped
            automatically by URL handle.
          </li>
          <li>
            On the next step you will pick a default category, currency and
            shipping option for the imported products. You can edit each listing
            afterwards.
          </li>
        </ol>
      </div>

      <div
        onClick={onPickFile}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="shadow-neo flex cursor-pointer flex-col items-center justify-center rounded-md border-4 border-dashed border-black bg-white p-10 text-center transition-colors hover:bg-gray-50"
      >
        <DocumentArrowUpIcon className="mb-3 h-12 w-12 text-black" />
        <p className="mb-1 font-bold text-black">
          {fileName
            ? `Selected: ${fileName}`
            : "Click to choose or drop your Shopify CSV here"}
        </p>
        <p className="text-sm text-gray-600">.csv files only</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>

      {parseError && (
        <div className="flex items-start gap-2 rounded-md border-2 border-red-500 bg-red-50 p-3 text-sm text-red-800">
          <XCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>{parseError}</div>
        </div>
      )}
    </div>
  );
}

interface ConfigureStepProps {
  parseResult: ShopifyParseResult;
  filteredByDraftSelection: ShopifyProduct[];
  selectedHandles: Set<string>;
  toggleAll: () => void;
  toggleHandle: (handle: string) => void;
  defaultCurrency: string;
  setDefaultCurrency: (v: string) => void;
  currencyOptions: { value: string; label: string }[];
  defaultCategory: string;
  setDefaultCategory: (v: string) => void;
  defaultLocation: string;
  setDefaultLocation: (v: string) => void;
  defaultShippingOption: string;
  setDefaultShippingOption: (v: string) => void;
  defaultShippingCost: string;
  setDefaultShippingCost: (v: string) => void;
  includeDrafts: boolean;
  setIncludeDrafts: (v: boolean) => void;
  pickupLocation: string;
  setPickupLocation: (v: string) => void;
}

function ConfigureStep({
  parseResult,
  filteredByDraftSelection,
  selectedHandles,
  toggleAll,
  toggleHandle,
  defaultCurrency,
  setDefaultCurrency,
  currencyOptions,
  defaultCategory,
  setDefaultCategory,
  defaultLocation,
  setDefaultLocation,
  defaultShippingOption,
  setDefaultShippingOption,
  defaultShippingCost,
  setDefaultShippingCost,
  includeDrafts,
  setIncludeDrafts,
  pickupLocation,
  setPickupLocation,
}: ConfigureStepProps) {
  const allSelected =
    filteredByDraftSelection.length > 0 &&
    filteredByDraftSelection.every((p) => selectedHandles.has(p.handle));

  const showShippingCost =
    defaultShippingOption === "Added Cost" ||
    defaultShippingOption === "Added Cost/Pickup";

  const showPickup =
    defaultShippingOption === "Pickup" ||
    defaultShippingOption === "Free/Pickup" ||
    defaultShippingOption === "Added Cost/Pickup";

  return (
    <div className="space-y-6">
      <div className="rounded-md border-2 border-black bg-blue-50 p-3 text-sm text-black">
        Found <b>{parseResult.products.length}</b> products across{" "}
        <b>{parseResult.rowCount}</b> CSV rows. Choose defaults below — they
        apply to every imported listing and you can edit each one afterwards.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label="Default Milk Market category"
          selectedKeys={
            defaultCategory ? new Set([defaultCategory]) : new Set()
          }
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0];
            if (typeof v === "string") setDefaultCategory(v);
          }}
          variant="bordered"
          classNames={MIGRATION_SELECT_CLASSNAMES}
        >
          {CATEGORIES.map((c) => (
            <SelectItem key={c}>{c}</SelectItem>
          ))}
        </Select>

        <Select
          label="Currency"
          selectedKeys={new Set([defaultCurrency])}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0];
            if (typeof v === "string") setDefaultCurrency(v);
          }}
          variant="bordered"
          classNames={MIGRATION_SELECT_CLASSNAMES}
        >
          {currencyOptions.map((c) => (
            <SelectItem key={c.value}>{c.label}</SelectItem>
          ))}
        </Select>

        <Input
          label="Default location (city, region)"
          value={defaultLocation}
          onChange={(e) => setDefaultLocation(e.target.value)}
          variant="bordered"
          placeholder="e.g. Austin, TX"
          classNames={MIGRATION_INPUT_CLASSNAMES}
        />

        <Select
          label="Default shipping option"
          selectedKeys={new Set([defaultShippingOption])}
          onSelectionChange={(keys) => {
            const v = Array.from(keys)[0];
            if (typeof v === "string") setDefaultShippingOption(v);
          }}
          variant="bordered"
          classNames={MIGRATION_SELECT_CLASSNAMES}
        >
          {SHIPPING_OPTIONS.map((opt) => (
            <SelectItem key={opt}>{opt}</SelectItem>
          ))}
        </Select>

        {showShippingCost && (
          <Input
            type="number"
            label="Shipping cost"
            value={defaultShippingCost}
            onChange={(e) => setDefaultShippingCost(e.target.value)}
            variant="bordered"
            min={0}
            step={0.01}
            classNames={MIGRATION_INPUT_CLASSNAMES}
          />
        )}

        {showPickup && (
          <Input
            label="Pickup location"
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            variant="bordered"
            placeholder="e.g. Farm gate, Market stall #4"
            classNames={MIGRATION_INPUT_CLASSNAMES}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          id="include-drafts"
          type="checkbox"
          checked={includeDrafts}
          onChange={(e) => setIncludeDrafts(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-black"
        />
        <label
          htmlFor="include-drafts"
          className="cursor-pointer text-sm font-bold text-black"
        >
          Include draft / archived Shopify products (otherwise only Active
          products are imported)
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-bold text-black">
            Products to import ({selectedHandles.size}/
            {filteredByDraftSelection.length})
          </h4>
          <Button
            size="sm"
            onClick={toggleAll}
            className={WHITEBUTTONCLASSNAMES}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto rounded-md border-2 border-black">
          {filteredByDraftSelection.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No products match your filter. Try enabling drafts above.
            </div>
          ) : (
            <ul className="divide-y-2 divide-black">
              {filteredByDraftSelection.map((p) => {
                const checked = selectedHandles.has(p.handle);
                return (
                  <li
                    key={p.handle}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleHandle(p.handle)}
                      className="h-4 w-4 cursor-pointer accent-black"
                    />
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {p.imageUrls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrls[0]}
                          alt=""
                          className="h-10 w-10 flex-shrink-0 rounded border border-black object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 flex-shrink-0 rounded border border-black bg-gray-100" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold text-black">
                          {p.title}
                        </div>
                        <div className="truncate text-xs text-gray-600">
                          {p.variants.length} variant
                          {p.variants.length === 1 ? "" : "s"} ·{" "}
                          {p.imageUrls.length} image
                          {p.imageUrls.length === 1 ? "" : "s"} · status:{" "}
                          {p.status || "active"}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {parseResult.errors.length > 0 && (
        <div className="rounded-md border-2 border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-900">
          <div className="mb-1 flex items-center gap-2 font-bold">
            <ExclamationTriangleIcon className="h-4 w-4" />
            Parser warnings
          </div>
          <ul className="list-disc pl-5">
            {parseResult.errors.slice(0, 5).map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
            {parseResult.errors.length > 5 && (
              <li>… and {parseResult.errors.length - 5} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReviewStep({ listings }: { listings: BuiltShopifyListing[] }) {
  const totalWarnings = listings.reduce((sum, l) => sum + l.warnings.length, 0);
  return (
    <div className="space-y-4">
      <div className="rounded-md border-2 border-black bg-blue-50 p-3 text-sm text-black">
        Ready to publish <b>{listings.length}</b> listing
        {listings.length === 1 ? "" : "s"} as Nostr kind 30402 events.
        {totalWarnings > 0 && (
          <span className="ml-1">
            {totalWarnings} warning{totalWarnings === 1 ? "" : "s"} below — you
            can still publish and fix them after.
          </span>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto rounded-md border-2 border-black">
        <ul className="divide-y-2 divide-black">
          {listings.map((l) => {
            const priceTag = l.values.find((v) => v[0] === "price");
            const imageCount = l.values.filter((v) => v[0] === "image").length;
            const sizeCount = l.values.filter((v) => v[0] === "size").length;
            return (
              <li key={l.product.handle} className="px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-black">{l.product.title}</div>
                  <div className="text-sm font-bold text-black">
                    {priceTag?.[1]} {priceTag?.[2]}
                  </div>
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  {imageCount} image{imageCount === 1 ? "" : "s"} ·{" "}
                  {sizeCount > 0
                    ? `${sizeCount} variant${sizeCount === 1 ? "" : "s"}`
                    : "no variants"}
                </div>
                {l.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-yellow-800">
                    {l.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PublishStep({
  progress,
  total,
  results,
  status,
}: {
  progress: number;
  total: number;
  results: PublishResult[];
  status: string;
}) {
  const value = total === 0 ? 0 : Math.round((progress / total) * 100);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-bold text-black">
        <ArrowPathIcon className="h-4 w-4 animate-spin" />
        Publishing {progress} / {total} listings…
      </div>
      <Progress
        aria-label="Publish progress"
        value={value}
        classNames={{ indicator: "bg-black" }}
      />
      {status && <div className="text-xs text-gray-700 italic">{status}</div>}
      <ResultsList results={results} compact />
    </div>
  );
}

function DoneStep({ results }: { results: PublishResult[] }) {
  const successes = results.filter((r) => r.status === "success").length;
  const failures = results.filter((r) => r.status === "error").length;
  return (
    <div className="space-y-4">
      <div className="rounded-md border-2 border-black bg-green-50 p-3 text-sm text-black">
        <div className="flex items-center gap-2 font-bold">
          <CheckCircleIcon className="h-5 w-5 text-green-700" />
          Migration finished
        </div>
        <div className="mt-1">
          <b>{successes}</b> published successfully
          {failures > 0 && (
            <>
              , <b>{failures}</b> failed
            </>
          )}
          . They are now visible under your Listings.
        </div>
      </div>
      <ResultsList results={results} />
    </div>
  );
}

function ResultsList({
  results,
  compact = false,
}: {
  results: PublishResult[];
  compact?: boolean;
}) {
  if (results.length === 0) return null;
  return (
    <div
      className={`overflow-y-auto rounded-md border-2 border-black ${
        compact ? "max-h-40" : "max-h-[360px]"
      }`}
    >
      <ul className="divide-y-2 divide-black">
        {results.map((r, idx) => (
          <li key={`${r.handle}-${idx}`} className="px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              {r.status === "success" ? (
                <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-green-700" />
              ) : (
                <XCircleIcon className="h-4 w-4 flex-shrink-0 text-red-700" />
              )}
              <span className="flex-1 truncate font-bold text-black">
                {r.title}
              </span>
              {r.message && (
                <span className="truncate text-xs text-red-700">
                  {r.message}
                </span>
              )}
            </div>
            {!compact && r.warnings && r.warnings.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-7 text-xs text-yellow-800">
                {r.warnings.map((w, widx) => (
                  <li key={widx}>{w}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { ArrowUpTrayIcon };
