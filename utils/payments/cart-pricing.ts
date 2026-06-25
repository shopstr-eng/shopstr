import { convertCurrencyAmountToSats } from "@/utils/cashu/currency-conversion";
import { ProductData } from "@/utils/parsers/product-parser-functions";

export type CartOrderFormType = "shipping" | "contact" | "combined" | null;
export type CartShippingPickupPreference = "shipping" | "contact";

export type CartPricingItemInput = {
  productId?: string;
  quantity?: number;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
};

export type CartPricingProductInput = {
  product: ProductData;
  item: CartPricingItemInput;
  discountPercentage?: number;
};

export type CartShopProfile = {
  content?: {
    freeShippingThreshold?: number;
    name?: string;
  };
};

export type CartPricingItemResult = {
  productId: string;
  pubkey: string;
  title: string;
  unitPrice: number;
  unitPriceSats: number;
  quantity: number;
  subtotal: number;
  shippingCost: number;
  total: number;
  currency: string;
  discountPercentage?: number;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
};

export type CartPricingResult = {
  items: CartPricingItemResult[];
  productTotalsInSats: Record<string, number>;
  subtotal: number;
  shippingCost: number;
  total: number;
  currency: "sats";
};

function requireFiniteAmount(amount: number, label: string) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} is invalid`);
  }
}

function requireQuantity(quantity: number | undefined): number {
  const parsed = quantity ?? 1;
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Cart item quantity must be a positive integer");
  }
  return parsed;
}

function hasPurchasableSizes(product: ProductData): boolean {
  return Boolean(
    product.sizes?.some((size) => (product.sizeQuantities?.get(size) ?? 0) > 0)
  );
}

function requireAvailableProduct(product: ProductData, quantity: number) {
  if (product.status?.toLowerCase() === "sold") {
    throw new Error(`Listing "${product.title}" is sold out`);
  }

  if (product.expiration && Date.now() / 1000 > product.expiration) {
    throw new Error(`Listing "${product.title}" has expired`);
  }

  if (product.quantity !== undefined && product.quantity < quantity) {
    throw new Error(`Insufficient stock for "${product.title}"`);
  }

  if (
    product.sizes &&
    product.sizes.length > 0 &&
    !hasPurchasableSizes(product)
  ) {
    throw new Error(`Listing "${product.title}" is sold out`);
  }
}

function selectUnitPrice(
  product: ProductData,
  item: CartPricingItemInput,
  quantity: number
) {
  const requiresSize = hasPurchasableSizes(product);
  const requiresVolume = Boolean(product.volumes?.length);
  const requiresWeight = Boolean(product.weights?.length);

  if (requiresSize && !item.selectedSize) {
    throw new Error(`Size selection is required for "${product.title}"`);
  }

  if (requiresVolume && !item.selectedVolume) {
    throw new Error(`Volume selection is required for "${product.title}"`);
  }

  if (requiresWeight && !item.selectedWeight) {
    throw new Error(`Weight selection is required for "${product.title}"`);
  }

  if (item.selectedSize) {
    if (!product.sizes || !product.sizes.includes(item.selectedSize)) {
      throw new Error(`Invalid size selection for "${product.title}"`);
    }

    const sizeStock = product.sizeQuantities?.get(item.selectedSize);
    if (sizeStock !== undefined && sizeStock < quantity) {
      throw new Error(`Insufficient stock for "${product.title}"`);
    }
  }

  let unitPrice = product.price;

  if (item.selectedBulkOption && item.selectedBulkOption !== 1) {
    if (
      !Number.isInteger(item.selectedBulkOption) ||
      !product.bulkPrices?.has(item.selectedBulkOption)
    ) {
      throw new Error(`Invalid bulk tier for "${product.title}"`);
    }
    unitPrice = product.bulkPrices.get(item.selectedBulkOption)!;
  } else if (item.selectedVolume) {
    if (!product.volumes || !product.volumes.includes(item.selectedVolume)) {
      throw new Error(`Invalid volume selection for "${product.title}"`);
    }
    const volumePrice = product.volumePrices?.get(item.selectedVolume);
    if (volumePrice !== undefined) {
      unitPrice = volumePrice;
    }
  } else if (item.selectedWeight) {
    if (!product.weights || !product.weights.includes(item.selectedWeight)) {
      throw new Error(`Invalid weight selection for "${product.title}"`);
    }
    const weightPrice = product.weightPrices?.get(item.selectedWeight);
    if (weightPrice !== undefined) {
      unitPrice = weightPrice;
    }
  }

  requireFiniteAmount(unitPrice, "Cart item price");
  return unitPrice;
}

function shouldAddShipping(
  formType: CartOrderFormType,
  shippingPickupPreference: CartShippingPickupPreference,
  shippingType?: string
) {
  if (formType === "shipping") {
    return true;
  }

  if (formType === "contact" || !formType) {
    return false;
  }

  if (shippingPickupPreference === "contact") {
    return shippingType === "Added Cost" || shippingType === "Free";
  }

  return (
    shippingType === "Added Cost" ||
    shippingType === "Free" ||
    shippingType === "Free/Pickup" ||
    shippingType === "Added Cost/Pickup"
  );
}

export async function computeCartPricing({
  products,
  formType,
  shippingPickupPreference = "shipping",
  shopProfiles = new Map<string, CartShopProfile>(),
}: {
  products: CartPricingProductInput[];
  formType: CartOrderFormType;
  shippingPickupPreference?: CartShippingPickupPreference;
  shopProfiles?: Map<string, CartShopProfile>;
}): Promise<CartPricingResult> {
  if (!formType) {
    throw new Error("Cart order type is required");
  }

  if (products.length === 0) {
    throw new Error("Cart is empty");
  }

  const prepared = await Promise.all(
    products.map(async ({ product, item, discountPercentage = 0 }) => {
      const quantity = requireQuantity(item.quantity);
      requireAvailableProduct(product, quantity);

      const unitPrice = selectUnitPrice(product, item, quantity);
      const unitPriceSats = await convertCurrencyAmountToSats(
        unitPrice,
        product.currency || "sats"
      );

      if (
        !Number.isFinite(discountPercentage) ||
        discountPercentage < 0 ||
        discountPercentage > 100
      ) {
        throw new Error("Discount percentage is invalid");
      }

      const discountedUnitPrice =
        discountPercentage > 0
          ? unitPrice * (1 - discountPercentage / 100)
          : unitPrice;
      const discountedUnitPriceSats =
        discountPercentage > 0
          ? Math.ceil(unitPriceSats * (1 - discountPercentage / 100))
          : unitPriceSats;
      const subtotal = Math.ceil(discountedUnitPriceSats * quantity);

      return {
        product,
        item,
        quantity,
        unitPrice,
        unitPriceSats,
        discountedUnitPrice,
        subtotal,
        discountPercentage,
      };
    })
  );

  const sellerSubtotals = new Map<string, number>();
  for (const preparedItem of prepared) {
    const previous = sellerSubtotals.get(preparedItem.product.pubkey) ?? 0;
    sellerSubtotals.set(
      preparedItem.product.pubkey,
      previous + preparedItem.discountedUnitPrice * preparedItem.quantity
    );
  }

  const resultItems: CartPricingItemResult[] = [];

  for (const preparedItem of prepared) {
    const { product, item, quantity } = preparedItem;
    const shopProfile = shopProfiles.get(product.pubkey);
    const freeShippingThreshold =
      shopProfile?.content?.freeShippingThreshold ?? 0;
    const sellerSubtotal = sellerSubtotals.get(product.pubkey) ?? 0;
    const qualifiesForFreeShipping =
      freeShippingThreshold > 0 && sellerSubtotal >= freeShippingThreshold;

    let shippingCost = 0;
    if (
      !qualifiesForFreeShipping &&
      shouldAddShipping(
        formType,
        shippingPickupPreference,
        product.shippingType
      )
    ) {
      const shippingCostSats = await convertCurrencyAmountToSats(
        product.shippingCost ?? 0,
        product.currency || "sats"
      ).catch((error) => {
        if ((product.shippingCost ?? 0) === 0) {
          return 0;
        }
        throw error;
      });
      shippingCost = Math.ceil(shippingCostSats * quantity);
    }

    const total = preparedItem.subtotal + shippingCost;

    resultItems.push({
      productId: product.id,
      pubkey: product.pubkey,
      title: product.title,
      unitPrice: preparedItem.unitPrice,
      unitPriceSats: preparedItem.unitPriceSats,
      quantity,
      subtotal: preparedItem.subtotal,
      shippingCost,
      total,
      currency: "sats",
      discountPercentage:
        preparedItem.discountPercentage > 0
          ? preparedItem.discountPercentage
          : undefined,
      selectedSize: item.selectedSize || undefined,
      selectedVolume: item.selectedVolume || undefined,
      selectedWeight: item.selectedWeight || undefined,
      selectedBulkOption:
        item.selectedBulkOption && item.selectedBulkOption !== 1
          ? item.selectedBulkOption
          : undefined,
    });
  }

  const productTotalsInSats = Object.fromEntries(
    resultItems.map((item) => [item.productId, item.total])
  );
  const subtotal = resultItems.reduce((sum, item) => sum + item.subtotal, 0);
  const shippingCost = resultItems.reduce(
    (sum, item) => sum + item.shippingCost,
    0
  );
  const total = resultItems.reduce((sum, item) => sum + item.total, 0);

  return {
    items: resultItems,
    productTotalsInSats,
    subtotal,
    shippingCost,
    total,
    currency: "sats",
  };
}
