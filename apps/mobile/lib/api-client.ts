import { createMilkMarketApiClient } from "@milk-market/api-client";

import { getApiBaseUrl } from "@/lib/api-base-url";

export const mobileApiClient = createMilkMarketApiClient({
  baseUrl: getApiBaseUrl(),
});
