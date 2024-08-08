export const shortenString = (val: string, onStart?: number, onEnd?: number) => {
    const fromStart = onStart ?? 4;
    const fromEnd = onEnd ?? fromStart;
    if (!val) return null;

    const strLen = val.length;
    const beginningString = val.substring(0, fromStart);
    const endString = val.substring(strLen - fromEnd, strLen);

    return `${beginningString}....${endString}`;
}

interface Fiat {
    code: "USD" | "GBP" | "EUR",
    symbol: "&$36;" | "&pound;" | "&euro;";
    rate: "string",
    description: "United States Dollar" | "British Pound Sterling" | "Euro",
    rate_float: number,
}

export interface BitcoinPriceResponse {
    time: {
        updated: Date,
        updatedISO: Date['toISOString'],
        updateduk: Date,
    },
    disclaimer: string,
    chartName: "Bitcoin",
    bpi: {
        USD: Fiat,
        GBP: Fiat,
        EUR: Fiat
    }
}

export const fetchBitcoinPrice = async () => {
    const url = "https://api.coindesk.com/v1/bpi/currentprice.json";
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error("Error fetching fiat price.")
    }

    return await res.json() as BitcoinPriceResponse;
}

export const formatFiatBalance = (currency: Fiat['code'], priceFloat: number, balance: bigint) => {
    const value = Number((Number(balance) / 100_000_000 * (priceFloat)).toFixed(2));
    return {
        display_string: `${value} ${currency}`,
        value
    }
}