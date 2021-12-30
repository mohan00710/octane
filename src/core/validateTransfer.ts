import {
    DecodedTransferCheckedInstruction,
    DecodedTransferInstruction,
    decodeInstruction,
    getAccount,
    isTransferCheckedInstruction,
    isTransferInstruction,
} from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';
import { connection } from './connection';
import { ENV_TRANSFER_ACCOUNT, ENV_TRANSFER_DECIMALS, ENV_TRANSFER_FEE, ENV_TRANSFER_MINT } from './env';

// Check that a transaction contains a valid transfer to Octane's token account
export async function validateTransfer(
    transaction: Transaction
): Promise<DecodedTransferInstruction | DecodedTransferCheckedInstruction> {
    // Get the first instruction of the transaction
    const [first] = transaction.instructions;
    if (!first) throw new Error('missing instructions');

    // Decode the first instruction and make sure it's a valid SPL Token `Transfer` or `TransferChecked` instruction
    const instruction = decodeInstruction(first);
    if (!(isTransferInstruction(instruction) || isTransferCheckedInstruction(instruction)))
        throw new Error('invalid transfer instruction');

    const {
        keys: { source, destination, owner },
        data: { amount },
    } = instruction;

    // Check that the instruction is going to pay the fee
    if (amount < ENV_TRANSFER_FEE) throw new Error('invalid amount');

    // Check that the instruction has a valid source account
    if (!source.isWritable) throw new Error('source not writable');
    if (source.isSigner) throw new Error('source is signer');

    // Check that the source account exists, has the correct mint, is not frozen, and has enough funds
    const account = await getAccount(connection, source.pubkey, 'confirmed');
    if (!account.mint.equals(ENV_TRANSFER_MINT)) throw new Error('source invalid mint');
    if (account.isFrozen) throw new Error('source frozen');
    if (account.amount < amount) throw new Error('source insufficient balance');

    // Check that the destination account is Octane's and is valid
    if (!destination.pubkey.equals(ENV_TRANSFER_ACCOUNT)) throw new Error('invalid destination');
    if (!destination.isWritable) throw new Error('destination not writable');
    if (destination.isSigner) throw new Error('destination is signer');

    // Check that the owner of the source account is correct, valid, and has signed
    if (!owner.pubkey.equals(account.owner)) throw new Error('owner is invalid');
    if (!owner.pubkey.equals(transaction.signatures[1].publicKey)) throw new Error('owner missing signature');
    if (owner.isWritable) throw new Error('owner is writable');
    if (!owner.isSigner) throw new Error('owner not signer');

    // If the instruction is a `TransferChecked` instruction, check that the mint and decimals are valid
    if (isTransferCheckedInstruction(instruction)) {
        const {
            keys: { mint },
            data: { decimals },
        } = instruction;

        if (decimals !== ENV_TRANSFER_DECIMALS) throw new Error('invalid decimals');

        if (!mint.pubkey.equals(ENV_TRANSFER_MINT)) throw new Error('invalid mint');
        if (mint.isWritable) throw new Error('mint is writable');
        if (mint.isSigner) throw new Error('mint is signer');
    }

    return instruction;
}