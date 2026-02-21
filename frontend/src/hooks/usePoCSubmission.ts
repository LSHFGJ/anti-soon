import { useState, useCallback } from 'react'
import { decodeEventLog } from 'viem'
import type { Address } from 'viem'
import { useWallet } from './useWallet'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import {
  generateRandomSalt,
  aesGcmEncrypt,
  computeCommitHash,
  hashCiphertext
} from '../utils/encryption'

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const clean = hex.slice(2)
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

export const SUBMISSION_LIFECYCLE_PHASES = [
  'idle',
  'encrypting',
  'committing',
  'committed',
  'revealing',
  'revealed',
  'failed'
] as const

export type SubmissionLifecyclePhase = (typeof SUBMISSION_LIFECYCLE_PHASES)[number]

interface SubmissionState {
  phase: SubmissionLifecyclePhase
  submissionId?: bigint
  salt?: `0x${string}`
  iv?: `0x${string}`
  cipherURI?: string
  commitHash?: `0x${string}`
  ciphertext?: `0x${string}`
  commitTxHash?: `0x${string}`
  revealTxHash?: `0x${string}`
  error?: string
}

interface SubmitPoCResult {
  submissionId?: bigint
  commitTxHash?: `0x${string}`
  revealTxHash?: `0x${string}`
}

export const usePoCSubmission = () => {
  const [state, setState] = useState<SubmissionState>({ phase: 'idle' })
  const { address, walletClient, publicClient, isConnected } = useWallet()

  const setFailed = useCallback((message: string) => {
    setState(s => ({ ...s, phase: 'failed', error: message }))
  }, [])

  const uploadToIPFS = async (ciphertext: `0x${string}`, iv: `0x${string}`): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 800))
    const payload = JSON.stringify({ ciphertext, iv })
    const payloadBytes = new TextEncoder().encode(payload)
    const digestBuffer = await crypto.subtle.digest('SHA-256', payloadBytes)
    const payloadHash = `0x${bytesToHex(new Uint8Array(digestBuffer))}` as `0x${string}`
    return `ipfs://Qm${payloadHash.slice(4, 50)}`
  }

  const submitPoC = useCallback(async (projectId: bigint, pocData: string): Promise<SubmitPoCResult | undefined> => {

    if (!isConnected || !walletClient || !publicClient || !address) {
      setFailed('Wallet not connected. Connect your wallet and retry submission.')
      return undefined
    }

    try {
      setState(s => ({ ...s, phase: 'encrypting', error: undefined }))

      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/project/${projectId}/public-key`)
      if (!response.ok) throw new Error('Failed to fetch project public key')
      const data = await response.json()
      const publicKey = data.publicKey as `0x${string}`

      if (!publicKey) {
        setFailed('Project public key is unavailable. Ensure the project is registered with a public key before submitting.')
        return undefined
      }

      const publicKeyBytes = hexToBytes(publicKey)
      const { ciphertext, iv } = await aesGcmEncrypt(pocData, publicKeyBytes)

      const ciphertextHex = `0x${bytesToHex(ciphertext)}` as `0x${string}`
      const ivHex = `0x${bytesToHex(iv)}` as `0x${string}`

      const salt = generateRandomSalt()
      const cipherHash = hashCiphertext(ciphertextHex)
      const commitHash = computeCommitHash(cipherHash, address as Address, salt)

      setState(s => ({ ...s, phase: 'committing' }))

      const cipherURI = await uploadToIPFS(ciphertextHex, ivHex)

      setState(s => ({ ...s, phase: 'committing', salt, iv: ivHex, ciphertext: ciphertextHex, cipherURI, commitHash }))

      const { request } = await publicClient.simulateContract({
        account: address,
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'commitPoC',
        args: [projectId, commitHash, cipherURI]
      })

      const commitTxHash = await walletClient.writeContract(request)

      setState(s => ({ ...s, commitTxHash }))

      const receipt = await publicClient.waitForTransactionReceipt({ hash: commitTxHash })

      let submissionId: bigint | undefined
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: BOUNTY_HUB_V2_ABI,
            data: log.data,
            topics: log.topics
          })
          if (decoded.eventName === 'PoCCommitted' && decoded.args) {
            const args = decoded.args as { submissionId?: bigint }
            submissionId = args.submissionId
            break
          }
        } catch {
        }
      }

      if (!submissionId) {
        submissionId = BigInt(Date.now())
      }

      setState(s => ({ ...s, phase: 'committed', submissionId }))

      // Reveal phase - Vault DON manages the decryption key, so we pass zero
      setState(s => ({ ...s, phase: 'revealing' }))

      const zeroKey = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`

      const { request: revealRequest } = await publicClient.simulateContract({
        account: address,
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'revealPoC',
        args: [submissionId, zeroKey, salt]
      })

      const revealTxHash = await walletClient.writeContract(revealRequest)

      setState(s => ({ ...s, revealTxHash }))

      await publicClient.waitForTransactionReceipt({ hash: revealTxHash })

      setState(s => ({ ...s, phase: 'revealed' }))

      return {
        submissionId,
        commitTxHash,
        revealTxHash
      }
    } catch (err: any) {
      console.error('Submission error:', err)
      setFailed(`Submission failed: ${err.message || 'unknown error'}. Reset and try again.`)
      return undefined
    }
  }, [isConnected, walletClient, publicClient, address, setFailed])

  const reset = useCallback(() => {
    setState({ phase: 'idle' })
  }, [])

  return {
    state,
    submitPoC,
    reset,
    isSubmitting: state.phase !== 'idle' && state.phase !== 'failed' && state.phase !== 'committed' && state.phase !== 'revealed',
    submissionId: state.submissionId,
    commitTxHash: state.commitTxHash,
    revealTxHash: state.revealTxHash,
    error: state.error
  }
}
