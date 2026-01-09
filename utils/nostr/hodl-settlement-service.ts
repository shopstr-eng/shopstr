import { NWCClient, Nip47SettleHoldInvoiceResponse } from "@getalby/sdk";
import { reserveInventory, saveHodlInvoiceToDb, getPreimageFromDb, getDbPool, deleteReservation, queueFailedSettlement } from "@/utils/db/db-service";
import { constructGiftWrappedEvent, constructMessageSeal, constructMessageGiftWrap, sendGiftWrappedMessageEvent, generateKeys, ORDER_MESSAGE_TYPES } from "@/utils/nostr/nostr-helper-functions";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { nip19 } from "nostr-tools";
import { decryptForServer } from "@/utils/encryption";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { randomBytes } from "crypto"; 

interface Nip47Transaction {
  type: string;
  invoice: string;
  payment_hash: string;
  state: "pending" | "held" | "accepted" | "settled" | "failed" | "ACCEPTED"; 
}

export class HodlSettlementService {
  private nwcClient: NWCClient;
  private nostr: NostrManager;
  private signer: NostrSigner; 
  private sellerPubkey: string;

  private constructor(nwcString: string, nostrManager: NostrManager, sellerSigner: NostrSigner, pubkey: string) {
    this.nwcClient = new NWCClient({ nostrWalletConnectUrl: nwcString });
    this.nostr = nostrManager;
    this.signer = sellerSigner;
    this.sellerPubkey = pubkey;
  }

  // Factory: Decrypts keys and initializes the service
  public static async createForSeller(sellerConfig: any, nostrManager: NostrManager): Promise<HodlSettlementService> {
      const nwcString = decryptForServer(sellerConfig.encrypted_nwc_string);
      const privKey = decryptForServer(sellerConfig.encrypted_priv_key); 
      
      if (!nwcString || !privKey) throw new Error(`Invalid credentials for seller ${sellerConfig.pubkey}`);

      const signer = new NostrNSecSigner({ encryptedPrivKey: privKey }, async () => ({ res: "", remind: false }));
      
      return new HodlSettlementService(nwcString, nostrManager, signer, sellerConfig.pubkey);
  }

  public async init() {
    console.log(`[${this.sellerPubkey.slice(0,6)}] Starting HODL Service...`);
    
    await this.checkPendingInvoices();

    await this.processRetryQueue();
    
    await this.checkDmsForOrders();
  }

  private async checkDmsForOrders() {
      const db = getDbPool();
      const client = await db.connect();
      
      try {
          const filter = {
              kinds: [1059], 
              '#p': [this.sellerPubkey],
              since: Math.floor(Date.now() / 1000) - 600 
          };
          
          // USE SUBSCRIBE + EOSE instead of simple fetch for better sync
          await new Promise<void>(async (resolve) => {
            const sub = await this.nostr.subscribe([filter], {
             onevent: async (event) => {
              try {
                  const decrypted = await this.signer.decrypt(event.pubkey, event.content);
                  const request = JSON.parse(decrypted);
                  
                  if (request.type === ORDER_MESSAGE_TYPES.REQUEST) {
                      const existing = await client.query(`SELECT 1 FROM hodl_invoices WHERE order_id = $1`, [request.orderId]);
                      if (existing.rows.length > 0) {
                          console.log(`Duplicate order request ignored: ${request.orderId}`);
                          return;
                      }

                      console.log(`📦 Processing Order: ${request.orderId}`);
                      const items = Array.isArray(request.items) ? request.items : [request.item];
                      const { total, valid } = await this.calculateOrderTotal(items);

                      if (!valid) return;
                      
                      await this.createHodlOffer(
                          request.orderId, 
                          items,
                          total,
                          event.pubkey 
                      );
                  }
              } catch (e) { /* ignore */ }
             },
             oneose: () => {
                 sub.close();
                 resolve();
             }
            });
            
            // Failsafe timeout
            setTimeout(() => { sub.close(); resolve(); }, 10000);
          });

      } finally {
          if (client) client.release();
      }
  }

  private async calculateOrderTotal(productIds: string[]): Promise<{ total: number, valid: boolean }> {
      const db = getDbPool();
      let total = 0;
      for (const id of productIds) {
        const res = await db.query(`SELECT tags FROM product_events WHERE id = $1`, [id]);
        const priceTag = res.rows[0]?.tags.find((t: string[]) => t[0] === 'price');
        const price = priceTag ? parseInt(priceTag[1]) : 0;

        if (price <= 0) {
            console.error(`Invalid price for product ${id}`);
            return { total: 0, valid: false };
        }
        total += price;
      }
      return { total, valid: true };
  }

  private async createHodlOffer(orderId: string, productIds: string[], amount: number, buyerPubkey: string) {
    const preimageBytes = randomBytes(32);
    const preimage = preimageBytes.toString('hex');
    const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(preimageBytes));
    const paymentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const isReserved = await reserveInventory(productIds, paymentHash);
    
    if (!isReserved) {
        console.warn(`Items ${productIds.join(',')} Out of Stock for Order ${orderId}`);
        await this.sendDmToBuyer(buyerPubkey, {
            type: ORDER_MESSAGE_TYPES.FAILED,
            reason: "out_of_stock",
            order_id: orderId,
            message: "Sorry, one or more items just sold out!"
        });
        return;
    }

    await saveHodlInvoiceToDb({
        paymentHash,
        preimage, 
        orderId,
        pubkey: buyerPubkey,
        amount,
        productId: productIds.join(',')
    });

    const transaction = await this.nwcClient.makeHoldInvoice({
        amount,
        payment_hash: paymentHash,
        description: `Order ${orderId}`
    });

    await this.sendDmToBuyer(buyerPubkey, {
        type: ORDER_MESSAGE_TYPES.OFFER,
        invoice: transaction.invoice,
        payment_hash: paymentHash,
        order_id: orderId
    });
  }

  private async sendDmToBuyer(buyerPubkey: string, contentJson: any) {
    const messageContent = JSON.stringify(contentJson);
    
    const { nsec: tempNsec, npub: tempNpub } = await generateKeys();
    const decodedTempPriv = nip19.decode(tempNsec).data as Uint8Array;
    
    const giftWrappedEvent = await constructGiftWrappedEvent(
        this.sellerPubkey,
        buyerPubkey,
        messageContent,
        "zapsnag-invoice"
    );
    
    const sealedEvent = await constructMessageSeal(this.signer, giftWrappedEvent, this.sellerPubkey, buyerPubkey);
    const finalEvent = await constructMessageGiftWrap(sealedEvent, tempNpub, decodedTempPriv, buyerPubkey); 
    await sendGiftWrappedMessageEvent(this.nostr, finalEvent);
  }

  private async checkPendingInvoices() {
      const db = getDbPool();
      
      const now = Math.floor(Date.now() / 1000);
      const expired = await db.query(
          `SELECT ir.payment_hash FROM inventory_reservations ir
           JOIN hodl_invoices hi ON ir.payment_hash = hi.payment_hash
           WHERE ir.expires_at < $1 AND hi.status = 'pending' AND hi.pubkey = $2`,
          [now, this.sellerPubkey] as any[]
      );
      
      for (const row of expired.rows as any[]) {
          try {
              console.log(`❌ Cancelling expired invoice: ${row.payment_hash}`);
              await this.nwcClient.cancelHoldInvoice({ payment_hash: row.payment_hash });
              await db.query(`UPDATE hodl_invoices SET status = 'cancelled' WHERE payment_hash = $1`, [row.payment_hash]);
              await deleteReservation(row.payment_hash);
          } catch (e) {
              console.error(`Failed to cancel invoice`, e);
          }
      }
      
      await db.query(`DELETE FROM inventory_reservations WHERE expires_at < $1`, [now]);

      const pending = await db.query(
          `SELECT payment_hash FROM hodl_invoices WHERE status = 'pending' AND pubkey = $1`, 
          [this.sellerPubkey]
      );

      for (const row of pending.rows) {
          const payment_hash = row.payment_hash;
          try {
              const tx = await this.nwcClient.lookupInvoice({ payment_hash }) as unknown as Nip47Transaction;
              
              // 'held' or 'accepted' means the buyer paid and funds are locked
              if (tx.state === "ACCEPTED" || tx.state === "accepted" || tx.state === "held") {
                 const preimage = await getPreimageFromDb(payment_hash);
                 if (preimage) {
                     console.log(`✅ Settling Locked Order: ${payment_hash}`);
                     await this.settleWithRetry(preimage, payment_hash);
                     await db.query(`UPDATE hodl_invoices SET status = 'settled' WHERE payment_hash = $1`, [payment_hash]);
                 }
              }
          } catch (e) {
              console.error(`Failed to lookup invoice ${payment_hash}`, e);
          }
      }
  }

  private async settleWithRetry(preimage: string, paymentHash: string, retries = 3): Promise<Nip47SettleHoldInvoiceResponse | undefined> {
      for (let i = 0; i < retries; i++) {
          try {
              return await this.nwcClient.settleHoldInvoice({ 
                  preimage: preimage 
              });
          } catch (e) {
              if (i === retries - 1) {
                  console.error("Settlement failed after retries - Queueing", e);
                  await queueFailedSettlement(paymentHash, preimage);
              }
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
          }
      }
      return undefined;
  }

  private async processRetryQueue() {
      const db = getDbPool();
      const now = Math.floor(Date.now() / 1000);
      const res = await db.query(`SELECT payment_hash, preimage FROM failed_settlements WHERE next_retry_at <= $1 LIMIT 10`, [now]);
      
      for (const row of res.rows) {
          console.log(`🔄 Retrying from queue: ${row.payment_hash}`);
          try {
              const result = await this.nwcClient.settleHoldInvoice({ preimage: row.preimage });
              if (result) {
                  await db.query(`DELETE FROM failed_settlements WHERE payment_hash = $1`, [row.payment_hash]);
                  await db.query(`UPDATE hodl_invoices SET status = 'settled' WHERE payment_hash = $1`, [row.payment_hash]);
              }
          } catch(e) {
              const next = now + 600;
              await db.query(`UPDATE failed_settlements SET next_retry_at = $1 WHERE payment_hash = $2`, [next, row.payment_hash]);
          }
      }
  }
}