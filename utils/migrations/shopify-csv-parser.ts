export type ShopifyCsvRow = Record<string, string>;

export interface ShopifyVariant {
  sku: string;
  barcode: string;
  optionNames: string[];
  optionValues: string[];
  price: string;
  compareAtPrice: string;
  inventoryQuantity: number;
  weight: string;
  weightUnit: string;
  requiresShipping: boolean;
  variantImageUrl: string;
}

export interface ShopifyProduct {
  handle: string;
  title: string;
  description: string;
  vendor: string;
  productCategory: string;
  type: string;
  tags: string[];
  status: string;
  publishedOnOnlineStore: boolean;
  giftCard: boolean;
  seoTitle: string;
  seoDescription: string;
  googleProductCategory: string;
  googleCondition: string;
  imageUrls: string[];
  variants: ShopifyVariant[];
  rawRows: ShopifyCsvRow[];
}

export interface ShopifyParseResult {
  products: ShopifyProduct[];
  errors: string[];
  rowCount: number;
  headers: string[];
}

const TRUE_VALUES = new Set(["true", "yes", "1", "active"]);

const isTrue = (v: string | undefined) => {
  if (!v) return false;
  return TRUE_VALUES.has(v.trim().toLowerCase());
};

const splitTags = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
};

/**
 * Robust CSV parser that handles quoted fields, embedded commas, embedded
 * newlines, and escaped quotes ("").
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  while (i < text.length) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ",") {
      current.push(field);
      field = "";
      i++;
      continue;
    }

    if (ch === "\r") {
      // ignore, handled by \n
      i++;
      continue;
    }

    if (ch === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Push trailing field/row
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

const findHeader = (
  headers: string[],
  candidates: string[]
): string | undefined => {
  const lowerMap = new Map<string, string>();
  headers.forEach((h) => lowerMap.set(h.trim().toLowerCase(), h));
  for (const c of candidates) {
    const found = lowerMap.get(c.toLowerCase());
    if (found) return found;
  }
  // Try startsWith matches for things like "Color (product.metafields..."
  for (const c of candidates) {
    for (const [low, original] of lowerMap.entries()) {
      if (low.startsWith(c.toLowerCase())) return original;
    }
  }
  return undefined;
};

/**
 * Parse Shopify product CSV (matrixify or standard export) into grouped products.
 * Rows that share the same URL handle are merged: the first row with a Title is
 * the parent (carrying description, tags, etc.), subsequent rows are variants
 * and/or additional images.
 */
export function parseShopifyProductCsv(text: string): ShopifyParseResult {
  const errors: string[] = [];
  const tableRaw = parseCsv(text);
  if (tableRaw.length === 0) {
    return {
      products: [],
      errors: ["The file appears to be empty."],
      rowCount: 0,
      headers: [],
    };
  }

  // Drop fully empty trailing rows
  const table = tableRaw.filter(
    (row) => row.length > 0 && row.some((c) => (c || "").trim() !== "")
  );
  if (table.length === 0) {
    return {
      products: [],
      errors: ["The file appears to be empty."],
      rowCount: 0,
      headers: [],
    };
  }

  const headers = table[0]!.map((h) => (h || "").trim());

  const H = {
    title: findHeader(headers, ["Title"])!,
    handle: findHeader(headers, ["URL handle", "Handle"]),
    description: findHeader(headers, [
      "Description",
      "Body (HTML)",
      "Body HTML",
    ]),
    vendor: findHeader(headers, ["Vendor"]),
    productCategory: findHeader(headers, [
      "Product category",
      "Product Category",
      "Category",
    ]),
    type: findHeader(headers, ["Type", "Product Type"]),
    tags: findHeader(headers, ["Tags"]),
    published: findHeader(headers, ["Published on online store", "Published"]),
    status: findHeader(headers, ["Status"]),
    sku: findHeader(headers, ["SKU", "Variant SKU"]),
    barcode: findHeader(headers, ["Barcode", "Variant Barcode"]),
    option1Name: findHeader(headers, ["Option1 name", "Option1 Name"]),
    option1Value: findHeader(headers, ["Option1 value", "Option1 Value"]),
    option2Name: findHeader(headers, ["Option2 name", "Option2 Name"]),
    option2Value: findHeader(headers, ["Option2 value", "Option2 Value"]),
    option3Name: findHeader(headers, ["Option3 name", "Option3 Name"]),
    option3Value: findHeader(headers, ["Option3 value", "Option3 Value"]),
    price: findHeader(headers, ["Price", "Variant Price"]),
    compareAt: findHeader(headers, [
      "Compare-at price",
      "Compare At Price",
      "Variant Compare At Price",
    ]),
    inventory: findHeader(headers, [
      "Inventory quantity",
      "Variant Inventory Qty",
    ]),
    weight: findHeader(headers, [
      "Weight value (grams)",
      "Variant Grams",
      "Weight",
    ]),
    weightUnit: findHeader(headers, [
      "Weight unit for display",
      "Variant Weight Unit",
    ]),
    requiresShipping: findHeader(headers, [
      "Requires shipping",
      "Variant Requires Shipping",
    ]),
    productImageUrl: findHeader(headers, [
      "Product image URL",
      "Image Src",
      "Image src",
    ]),
    imagePosition: findHeader(headers, ["Image position", "Image Position"]),
    variantImageUrl: findHeader(headers, [
      "Variant image URL",
      "Variant Image",
    ]),
    giftCard: findHeader(headers, ["Gift card", "Gift Card"]),
    seoTitle: findHeader(headers, ["SEO title", "SEO Title"]),
    seoDescription: findHeader(headers, ["SEO description", "SEO Description"]),
    googleCategory: findHeader(headers, [
      "Google Shopping / Google product category",
    ]),
    googleCondition: findHeader(headers, ["Google Shopping / Condition"]),
  };

  if (!H.title) {
    errors.push(
      "Missing required column 'Title'. Make sure you uploaded the standard Shopify product export."
    );
    return { products: [], errors, rowCount: 0, headers };
  }
  if (!H.handle) {
    errors.push(
      "Missing required column 'URL handle' (or 'Handle'). Cannot group product variants without it."
    );
    return { products: [], errors, rowCount: 0, headers };
  }

  const get = (row: string[], key: string | undefined): string => {
    if (!key) return "";
    const idx = headers.indexOf(key);
    if (idx === -1) return "";
    return (row[idx] ?? "").trim();
  };

  const productMap = new Map<string, ShopifyProduct>();
  let lastHandle = "";
  let rowCount = 0;

  for (let r = 1; r < table.length; r++) {
    const row = table[r]!;
    const handle = get(row, H.handle) || lastHandle;
    if (!handle) {
      errors.push(`Row ${r + 1}: missing URL handle, skipping.`);
      continue;
    }
    lastHandle = handle;
    rowCount++;

    let product = productMap.get(handle);
    const title = get(row, H.title);

    if (!product) {
      product = {
        handle,
        title: title || handle,
        description: get(row, H.description),
        vendor: get(row, H.vendor),
        productCategory: get(row, H.productCategory),
        type: get(row, H.type),
        tags: splitTags(get(row, H.tags)),
        status: (get(row, H.status) || "active").toLowerCase(),
        publishedOnOnlineStore: isTrue(get(row, H.published)),
        giftCard: isTrue(get(row, H.giftCard)),
        seoTitle: get(row, H.seoTitle),
        seoDescription: get(row, H.seoDescription),
        googleProductCategory: get(row, H.googleCategory),
        googleCondition: get(row, H.googleCondition),
        imageUrls: [],
        variants: [],
        rawRows: [],
      };
      productMap.set(handle, product);
    } else if (title) {
      // Header-style row arrived after variant rows; refresh metadata.
      product.title = title;
      const desc = get(row, H.description);
      if (desc && !product.description) product.description = desc;
      const vendor = get(row, H.vendor);
      if (vendor && !product.vendor) product.vendor = vendor;
      const tags = splitTags(get(row, H.tags));
      if (tags.length && product.tags.length === 0) product.tags = tags;
    }

    // Capture row
    const rawRow: ShopifyCsvRow = {};
    headers.forEach((h, idx) => (rawRow[h] = (row[idx] ?? "").trim()));
    product.rawRows.push(rawRow);

    // Capture images: product image + variant image
    const productImg = get(row, H.productImageUrl);
    if (productImg && !product.imageUrls.includes(productImg)) {
      product.imageUrls.push(productImg);
    }
    const variantImg = get(row, H.variantImageUrl);
    if (variantImg && !product.imageUrls.includes(variantImg)) {
      product.imageUrls.push(variantImg);
    }

    // Variant detection: variant exists if there's a SKU or option value or
    // a price on this row (and we already have a product header).
    const sku = get(row, H.sku);
    const opt1Val = get(row, H.option1Value);
    const opt2Val = get(row, H.option2Value);
    const opt3Val = get(row, H.option3Value);
    const price = get(row, H.price);

    const hasVariantData =
      !!sku || !!opt1Val || !!opt2Val || !!opt3Val || !!price;

    if (hasVariantData) {
      const opt1Name = get(row, H.option1Name);
      const opt2Name = get(row, H.option2Name);
      const opt3Name = get(row, H.option3Name);

      const optionNames = [opt1Name, opt2Name, opt3Name].filter(Boolean);
      const optionValues = [opt1Val, opt2Val, opt3Val].filter(Boolean);

      const inventoryStr = get(row, H.inventory);
      const inventoryQuantity = inventoryStr
        ? parseInt(inventoryStr, 10) || 0
        : 0;

      product.variants.push({
        sku,
        barcode: get(row, H.barcode),
        optionNames,
        optionValues,
        price,
        compareAtPrice: get(row, H.compareAt),
        inventoryQuantity,
        weight: get(row, H.weight),
        weightUnit: get(row, H.weightUnit),
        requiresShipping: isTrue(get(row, H.requiresShipping)),
        variantImageUrl: variantImg,
      });
    }
  }

  // Sort variants if image position is meaningful (not used for variants but ok)
  return {
    products: Array.from(productMap.values()),
    errors,
    rowCount,
    headers,
  };
}
