import { parseCanonicalProductEvent } from "@/utils/parsers/product-event/base-parser";
import { toUiProductData } from "@/utils/parsers/product-event/ui-adapter";
import { ProductData } from "@/utils/parsers/product-types";
import { NostrEvent } from "@/utils/types/types";

export type { ProductData };

export const parseTags = (productEvent: NostrEvent) => {
  if (productEvent.tags === undefined) return;

  const canonical = parseCanonicalProductEvent(productEvent);
  return toUiProductData(canonical, productEvent);
};

export default parseTags;
