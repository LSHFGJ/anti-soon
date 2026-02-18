import { useState, useCallback, useEffect } from 'react'
import { keccak256, decodeEventLog } from 'viem'
import type { Address } from 'viem'
import { useWallet } from './useWallet'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import {
  generateRandomKey,
  generateRandomSalt,
  xorEncrypt,
  computeCommitHash,
  hashCiphertext
} from '../utils/encryption'

type CommitPhase = 'idle' | 'encrypting' | 'uploading' | 'committing' | 'committed' | 'revealing' | 'revealed' | 'error'

interface CommitState {
  phase: CommitPhase
  submissionId?: bigint
  key?: `0x${string}`
  salt?: `0x${string}`
  cipherURI?: string
  commitHash?: `0x${string}`
  ciphertext?: `0x${string}`
  commitTxHash?: `0x${string}`
  revealTxHash?: `0x${string}`
  error?: string
}

const STORAGE_KEY_PREFIX = 'antisoon-poc-commit-'

export function useCommitReveal(projectId: bigint, pocJson: string) {
  const [state, setState] = useState<CommitState>({ phase: 'idle' })
  const { address, walletClient, publicClient, isConnected } = useWallet()

  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.submissionId && parsed.key && parsed.salt) {
          setState({
            phase: 'committed',
            submissionId: BigInt(parsed.submissionId),
            key: parsed.key,
            salt: parsed.salt,
            cipherURI: parsed.cipherURI,
            commitHash: parsed.commitHash,
            ciphertext: parsed.ciphertext,
            commitTxHash: parsed.commitTxHash
          })
        }
      } catch {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${projectId}`)
      }
    }
  }, [projectId])

  const uploadToIPFS = async (ciphertext: `0x${string}`): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 800))
    const hash = keccak256(ciphertext)
    return `ipfs://Qm${hash.slice(4, 50)}`
  }

  const commit = useCallback(async () => {
    if (!isConnected || !walletClient || !publicClient || !address) {
      setState(s => ({ ...s, phase: 'error', error: 'Wallet not connected' }))
      return
    }

    try {
      setState(s => ({ ...s, phase: 'encrypting', error: undefined }))

      const key = generateRandomKey()
      const salt = generateRandomSalt()
      const ciphertext = xorEncrypt(pocJson, key)
      const cipherHash = hashCiphertext(ciphertext)
      const commitHash = computeCommitHash(cipherHash, address as Address, salt)

      setState(s => ({ ...s, phase: 'uploading' }))

      const cipherURI = await uploadToIPFS(ciphertext)

      setState(s => ({ ...s, phase: 'committing', key, salt, ciphertext, cipherURI, commitHash }))

      const { request } = await publicClient.simulateContract({
        account: address,
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'commitPoC',
        args: [projectId, commitHash, cipherURI]
      })

      const txHash = await walletClient.writeContract(request)
      
      setState(s => ({ ...s, commitTxHash: txHash }))

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      
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

      const commitData = {
        submissionId: submissionId.toString(),
        key,
        salt,
        cipherURI,
        commitHash,
        ciphertext,
        commitTxHash: txHash
      }
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(commitData))

      setState(s => ({
        ...s,
        phase: 'committed',
        submissionId
      }))

    } catch (err: any) {
      console.error('Commit error:', err)
      setState(s => ({
        ...s,
        phase: 'error',
        error: err.message || 'Commit failed'
      }))
    }
  }, [isConnected, walletClient, publicClient, address, projectId, pocJson])

  const reveal = useCallback(async () => {
    if (!isConnected || !walletClient || !publicClient || !address) {
      setState(s => ({ ...s, phase: 'error', error: 'Wallet not connected' }))
      return
    }

    if (!state.submissionId || !state.key || !state.salt) {
      setState(s => ({ ...s, phase: 'error', error: 'No commit found' }))
      return
    }

    try {
      setState(s => ({ ...s, phase: 'revealing', error: undefined }))

      const { request } = await publicClient.simulateContract({
        account: address,
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'revealPoC',
        args: [state.submissionId, state.key, state.salt]
      })

      const txHash = await walletClient.writeContract(request)
      
      setState(s => ({ ...s, revealTxHash: txHash }))

      await publicClient.waitForTransactionReceipt({ hash: txHash })

      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${projectId}`)

      setState(s => ({ ...s, phase: 'revealed' }))

    } catch (err: any) {
      console.error('Reveal error:', err)
      setState(s => ({
        ...s,
        phase: 'error',
        error: err.message || 'Reveal failed'
      }))
    }
  }, [isConnected, walletClient, publicClient, address, state.submissionId, state.key, state.salt, projectId])

  const reset = useCallback(() => {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${projectId}`)
    setState({ phase: 'idle' })
  }, [projectId])

  return {
    state,
    commit,
    reveal,
    reset,
    isConnected
  }
}
