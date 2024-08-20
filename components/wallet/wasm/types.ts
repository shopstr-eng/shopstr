export type Prevout = {
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address: string;
    valuecommitment: string;
    assetcommitment: string;
};
export type Vin = {
    txid: string;
    vout: number;
    prevout: Prevout[];
    is_coinbase: boolean;
    sequence: number;
    inner_redeemscript_asm: string;
    is_pegin: boolean;
};

export type Transaction = {
    txid: string;
    version: number;
    locktime: number;
    vin: Vin[];
    vout: Prevout[];
    size: number;
    weight: number;
    fee: number;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
};

export interface TransactionResponse {
    transaction_response: Transaction[];
}
