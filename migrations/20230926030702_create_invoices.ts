import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('invoices', (table) => {

    table.uuid('id');
    table.dateTime('time');
    table.bigInteger('total'); // 1234
    table.bigInteger('sub_total');
    table.bigInteger('tip_total');
    table.bigInteger('shipping_total');
    table.bigInteger('discount_total');
    table.bigInteger('fee_total');
    table.bigInteger('tax_total');
    table.string('currency'); // SAT
    table.string('status'); // "NOT_PAID", "PAID"
    table.string('funding_source'); // "ln"
    table.text('notes'); // ""
    table.string('customer_id'); // "decrypted npub"
    table.string('merchant_id'); // "decrypted npub"
    table.specificType('product_ids', 'text ARRAY'); // ["eventId"] nostr eventId
    table.text('invoice'); // this is the ln url used for qr code
    table.string('hash'); // cashu hash
    table.geometry('customer_location') // customer
    table.geometry('merchant_location') // merchant

    table.primary(['id', 'time']);
  });
}



export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('invoices');
}




// invoice per product

// [store1, productA] [store2, productB] [store2, proudctC]

// invoice for pruidct A (store1)

// invoice for product pridcB and productC (store2)