import { useState } from 'react'
import { keccak256, toHex } from 'viem'
import { useWallet } from './useWallet'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_ABI } from '../config'

export const usePoCSubmission = () => {
  const { isConnected, walletClient, publicClient, address } = useWallet()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionHash, setSubmissionHash] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submitPoC = async (pocJson: string) => {
    if (!isConnected || !walletClient || !publicClient || !address) {
      setError("Wallet not connected")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const pocHash = keccak256(toHex(pocJson))
      const mockUri = `ipfs://mock-cid-${pocHash.substring(0, 10)}`
      const projectId = 1n

      const { request } = await publicClient.simulateContract({
        account: address,
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_ABI,
        functionName: 'submitPoC',
        args: [projectId, pocHash, mockUri]
      })

      const hash = await walletClient.writeContract(request)
      setSubmissionHash(hash)
    } catch (e: any) {
      console.error(e)
      setError(e.message || "Submission failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    isSubmitting,
    submissionHash,
    error,
    submitPoC
  }
}
