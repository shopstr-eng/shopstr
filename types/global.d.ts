declare module "@cashu/cashu-ts" {
  export type AmountLike = number;

  export interface Proof {
    amount: number;
    id?: string;
    secret: string;
    C: string;
    [key: string]: any;
  }

  export interface Keyset {
    id?: string;
    [key: string]: any;
  }

  export type CheckStateEnum = "SPENT" | "UNSPENT" | "PENDING" | string;
  export type SendConfig = Record<string, any>;
  export type OutputConfig = Record<string, any>;

  export interface MintQuoteBolt11Response {
    request: string;
    quote: string;
    state: string;
    amount: number;
    [key: string]: any;
  }

  export interface MeltQuoteBolt11Response {
    request: string;
    quote: string;
    state: string;
    amount: number;
    fee_reserve: number;
    paid: boolean;
    [key: string]: any;
  }

  export const MintQuoteState: {
    PAID: string;
    ISSUED: string;
    UNPAID?: string;
    [key: string]: string | undefined;
  };

  export class CashuMint {
    constructor(...args: any[]);
  }

  export class CashuWallet {
    constructor(...args: any[]);
    keyChain: {
      getKeysets: () => Keyset[];
    };
    loadMint(): Promise<void>;
    createMintQuoteBolt11(...args: any[]): Promise<MintQuoteBolt11Response>;
    checkMintQuoteBolt11(...args: any[]): Promise<MintQuoteBolt11Response>;
    mintProofsBolt11(...args: any[]): Promise<Proof[]>;
    createMeltQuoteBolt11(...args: any[]): Promise<MeltQuoteBolt11Response>;
    checkMeltQuoteBolt11(...args: any[]): Promise<MeltQuoteBolt11Response>;
    mintProofs(...args: any[]): Promise<Proof[]>;
    meltProofsBolt11(...args: any[]): Promise<any>;
    send(...args: any[]): Promise<{ keep?: Proof[]; send?: Proof[] }>;
    receive(...args: any[]): Promise<Proof[]>;
    checkProofsStates(
      ...args: any[]
    ): Promise<Array<{ state: CheckStateEnum; Y?: string }>>;
    restore(...args: any[]): Promise<any>;
  }

  export class HttpResponseError extends Error {
    status?: number;
    constructor(message?: string, status?: number, ...args: any[]);
  }

  export class RateLimitError extends Error {
    retryAfterMs?: number;
    constructor(message?: string, retryAfterMs?: number, ...args: any[]);
  }

  export { CashuMint as Mint, CashuWallet as Wallet };
  export function getEncodedToken(...args: any[]): string;
  export function getDecodedToken(token: string, keysetIds?: string[]): any;
}

declare module "@getalby/sdk" {
  export class NostrWebLNProvider {
    constructor(...args: any[]);
    enable(): Promise<void>;
    close(): void;
    getInfo(): Promise<any>;
    sendPayment(...args: any[]): Promise<any>;
    [key: string]: any;
  }
}

declare module "@getalby/lightning-tools" {
  export class LightningAddress {
    constructor(address: string);
    fetch(): Promise<any>;
    requestInvoice(...args: any[]): Promise<any>;
    zap(...args: any[]): Promise<any>;
    [key: string]: any;
  }
}

declare module "@heroui/react" {
  export type InputProps = {
    color?: string;
    [key: string]: any;
  };

  export type DropdownItemProps = {
    key?: import("react").Key;
    color?: string;
    className?: string;
    startContent?: import("react").ReactNode;
    onPress?: (() => void) | (() => Promise<void>);
    [key: string]: any;
  };

  export const Avatar: import("react").ComponentType<any>;
  export const BreadcrumbItem: import("react").ComponentType<any>;
  export const Breadcrumbs: import("react").ComponentType<any>;
  export const Button: import("react").ComponentType<any>;
  export const Card: import("react").ComponentType<any>;
  export const CardBody: import("react").ComponentType<any>;
  export const CardHeader: import("react").ComponentType<any>;
  export const Chip: import("react").ComponentType<any>;
  export const Divider: import("react").ComponentType<any>;
  export const Dropdown: import("react").ComponentType<any>;
  export const DropdownItem: import("react").ComponentType<any>;
  export const DropdownMenu: import("react").ComponentType<any>;
  export const DropdownSection: import("react").ComponentType<any>;
  export const DropdownTrigger: import("react").ComponentType<any>;
  export const HeroUIProvider: import("react").ComponentType<any>;
  export const Image: import("react").ComponentType<any>;
  export const Input: import("react").ComponentType<any>;
  export const Listbox: import("react").ComponentType<any>;
  export const ListboxItem: import("react").ComponentType<any>;
  export const ListboxSection: import("react").ComponentType<any>;
  export const Modal: import("react").ComponentType<any>;
  export const ModalBody: import("react").ComponentType<any>;
  export const ModalContent: import("react").ComponentType<any>;
  export const ModalFooter: import("react").ComponentType<any>;
  export const ModalHeader: import("react").ComponentType<any>;
  export const Pagination: import("react").ComponentType<any>;
  export const Progress: import("react").ComponentType<any>;
  export const Radio: import("react").ComponentType<any>;
  export const RadioGroup: import("react").ComponentType<any>;
  export const Select: import("react").ComponentType<any>;
  export const SelectItem: import("react").ComponentType<any>;
  export const SelectSection: import("react").ComponentType<any>;
  export const Slider: import("react").ComponentType<any>;
  export const Spinner: import("react").ComponentType<any>;
  export const Snippet: import("react").ComponentType<any>;
  export const Switch: import("react").ComponentType<any>;
  export const Textarea: import("react").ComponentType<any>;
  export const Tooltip: import("react").ComponentType<any>;
  export const User: import("react").ComponentType<any>;

  export function heroui(...args: any[]): any;
  export function useDisclosure(): {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    onOpenChange: (isOpen: boolean) => void;
  };
}
