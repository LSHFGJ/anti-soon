import { describe, expect, it } from "bun:test"
import { evaluateTimedDecryptPolicy } from "./decryptPolicy"

describe("timed decrypt policy", () => {
  it("allows requester when requester equals submitter before deadline", () => {
    const decision = evaluateTimedDecryptPolicy({
      submitter: "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
      requester: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      currentTimestamp: 1699999999,
      submissionDeadlineTimestamp: 1700000000,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.phase).toBe("pre_deadline")
    expect(decision.reason).toBe("submitter_pre_deadline")
  })

  it("denies non-submitter requester before deadline", () => {
    const decision = evaluateTimedDecryptPolicy({
      submitter: "0x1111111111111111111111111111111111111111",
      requester: "0x2222222222222222222222222222222222222222",
      currentTimestamp: 1699999999,
      submissionDeadlineTimestamp: 1700000000,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.phase).toBe("pre_deadline")
    expect(decision.reason).toBe("non_submitter_pre_deadline_denied")
  })

  it("treats exact deadline as post-deadline and allows any requester", () => {
    const decision = evaluateTimedDecryptPolicy({
      submitter: "0x1111111111111111111111111111111111111111",
      requester: "0x2222222222222222222222222222222222222222",
      currentTimestamp: 1700000000,
      submissionDeadlineTimestamp: 1700000000,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.phase).toBe("post_deadline")
    expect(decision.reason).toBe("post_deadline_public")
  })

  it("allows any requester after deadline", () => {
    const decision = evaluateTimedDecryptPolicy({
      submitter: "0x1111111111111111111111111111111111111111",
      requester: "0x3333333333333333333333333333333333333333",
      currentTimestamp: 1700000001,
      submissionDeadlineTimestamp: 1700000000,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.phase).toBe("post_deadline")
    expect(decision.reason).toBe("post_deadline_public")
  })
})
