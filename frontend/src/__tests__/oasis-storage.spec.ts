import { describe, expect, it } from 'vitest'
import {
  OASIS_ENVELOPE_VERSION,
  createOasisDecryptPolicyCall,
  computeOasisCommitBindingHash,
  computeOasisEnvelopeHash,
  createOasisEnvelope,
  createOasisReadCall,
  createOasisWriteCall,
  parseOasisEnvelope,
  serializeOasisEnvelopeCanonical,
} from '../lib/oasisStorage'

describe('oasis storage envelope', () => {
  it('accepts a valid envelope', () => {
    const envelope = createOasisEnvelope({
      pointer: {
        chain: 'oasis-sapphire-testnet',
        contract: '0x1111111111111111111111111111111111111111',
        slotId: 'slot-42',
      },
      ciphertext: {
        ciphertextHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ivHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    })

    expect(envelope.version).toBe(OASIS_ENVELOPE_VERSION)
  })

  it('rejects malformed envelope', () => {
    expect(() =>
      parseOasisEnvelope({
        version: OASIS_ENVELOPE_VERSION,
        pointer: {
          chain: 'oasis-sapphire-testnet',
          contract: '0x1111111111111111111111111111111111111111',
          slotId: 'slot-42',
        },
        ciphertext: {
          ivHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
      })
    ).toThrow('Invalid Oasis envelope')
  })

  it('uses stable serialization and deterministic commit binding hash', () => {
    const envelopeA = parseOasisEnvelope({
      version: OASIS_ENVELOPE_VERSION,
      pointer: {
        chain: 'oasis-sapphire-testnet',
        contract: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
        slotId: 'slot-42',
      },
      ciphertext: {
        ciphertextHash: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        ivHash: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      },
    })

    const envelopeB = parseOasisEnvelope({
      version: OASIS_ENVELOPE_VERSION,
      pointer: {
        chain: 'oasis-sapphire-testnet',
        contract: '0xabcdefABCDEFabcdefabcdefabcdefABCDEFabcd',
        slotId: 'slot-42',
      },
      ciphertext: {
        ciphertextHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ivHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    })

    expect(serializeOasisEnvelopeCanonical(envelopeA)).toBe(serializeOasisEnvelopeCanonical(envelopeB))
    expect(computeOasisEnvelopeHash(envelopeA)).toBe(computeOasisEnvelopeHash(envelopeB))

    const sender = '0x1234567890123456789012345678901234567890'
    const salt = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    expect(computeOasisCommitBindingHash(envelopeA, sender, salt)).toBe(
      computeOasisCommitBindingHash(envelopeB, sender, salt)
    )
  })

  it('builds deterministic write/read/decrypt-policy calls for T4 integration', () => {
    const writeCall = createOasisWriteCall({
      pointer: {
        chain: 'oasis-sapphire-testnet',
        contract: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
        slotId: 'slot-42',
      },
      ciphertext: '0xdeadbeef',
      iv: '0xfacefeed',
    })

    const readCall = createOasisReadCall({
      pointer: {
        chain: 'oasis-sapphire-testnet',
        contract: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        slotId: 'slot-42',
      },
    })

    const policyCall = createOasisDecryptPolicyCall({
      pointer: {
        chain: 'oasis-sapphire-testnet',
        contract: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
        slotId: 'slot-42',
      },
      requester: '0x1234567890123456789012345678901234567890',
      submissionDeadline: 1700000000,
    })

    expect(writeCall.kind).toBe('write')
    expect(writeCall.pointer.contract).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
    expect(readCall.kind).toBe('read')
    expect(policyCall.kind).toBe('decrypt-policy')
    expect(policyCall.submissionDeadline).toBe(1700000000)
  })
})
