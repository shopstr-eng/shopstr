import {generatePrivateKey, getPublicKey} from 'nostr-tools'

export let sk = generatePrivateKey() // `sk` is a hex string
export let pk = getPublicKey(sk) // `pk` is a hex string
